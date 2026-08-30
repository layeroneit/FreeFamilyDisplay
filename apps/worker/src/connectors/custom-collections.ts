/**
 * Custom wallpaper collections from a pasted Google link (spec §7 — "the
 * version of the feature that matters most"). Resolves the album/folder to
 * image URLs with the same reader the Photos widget uses, fetches each under
 * the SSRF guard, runs the wallpaper ingest (analysis + resize), stores the
 * assets on the media volume, and upserts Wallpaper rows whose basePath is
 * served owner-gated by web at /media/wallpapers/<collectionId>/<name>.
 *
 * Re-syncs on the connector cadence, so adding a photo to the album adds it
 * to the wall (spec §7). Images that vanish from the album are removed.
 */

import { createHash } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { decryptSecret } from "@ffd/crypto";
import { prisma } from "@ffd/db";
import { createLogger } from "@ffd/log";
import { safeFetch, UnsafeUrlError } from "../net/ssrf.js";
import { ingestWallpaper } from "../wallpaper-ingest.js";
import { classifyLink, driveFolderId, extractAlbumImageUrls, MAX_COLLECTION_PHOTOS } from "./google-photos.js";

const log = createLogger("worker.collections");
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

async function resolveLinkToImageUrls(link: string): Promise<string[]> {
  const kind = classifyLink(link);
  if (!kind) throw new Error("Paste a Google Photos shared-album link or a Google Drive folder link.");
  if (kind === "google-photos") {
    const page = await safeFetch(link, { accept: "text/html" });
    if (page.status !== 200) throw new Error(`Google Photos answered HTTP ${page.status} — is the album still shared?`);
    const urls = extractAlbumImageUrls(page.body.toString("utf8"));
    if (urls.length === 0) throw new Error("Couldn't read that album — a Drive folder link is the reliable alternative.");
    // Ask for a large rendition: wallpapers need the long edge at 1920+.
    return urls.map((u) => `${u}=w3840-h2160`);
  }
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("Google Drive folders need GOOGLE_API_KEY in .env — Google Photos album links work without it.");
  const q = encodeURIComponent(`'${driveFolderId(link)}' in parents and mimeType contains 'image/' and trashed = false`);
  const res = await safeFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=${MAX_COLLECTION_PHOTOS}&key=${encodeURIComponent(key)}`, { accept: "application/json" });
  if (res.status !== 200) throw new Error(`Google Drive answered HTTP ${res.status} — is the folder shared with "anyone with the link"?`);
  const body = JSON.parse(res.body.toString("utf8")) as { files?: Array<{ id: string }> };
  return (body.files ?? []).map((f) => `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}?alt=media&key=${encodeURIComponent(key)}`);
}

export async function syncCustomCollections(mediaDir: string): Promise<void> {
  const cols = await prisma.wallpaperCollection.findMany({
    where: { isBuiltin: false, sourceSecret: { not: null } },
    select: { id: true, sourceSecret: true, name: true },
  });
  for (const c of cols) {
    try {
      const link = decryptSecret(c.sourceSecret!, `collection:${c.id}`);
      const urls = await resolveLinkToImageUrls(link);
      const dir = path.join(mediaDir, "wallpapers", c.id);
      const keep = new Set<string>();
      let order = 0;
      let added = 0;
      let rejected = 0;
      for (const u of urls.slice(0, MAX_COLLECTION_PHOTOS)) {
        const name = createHash("sha256").update(u.split("?")[0]!.split("=")[0]!).digest("hex").slice(0, 24);
        const basePath = `/media/wallpapers/${c.id}/${name}`;
        keep.add(name);
        const existing = await prisma.wallpaper.findFirst({ where: { collectionId: c.id, basePath }, select: { id: true } });
        if (existing) {
          await prisma.wallpaper.update({ where: { id: existing.id }, data: { sortOrder: order++ } });
          continue;
        }
        try {
          const img = await safeFetch(u, { accept: "image/*", maxBytes: MAX_IMAGE_BYTES });
          if (img.status !== 200 || !img.contentType.startsWith("image/")) continue;
          const a = await ingestWallpaper(img.body, dir, name);
          await prisma.wallpaper.create({
            data: {
              collectionId: c.id,
              basePath,
              width: a.width,
              height: a.height,
              meanLuminance: a.meanLuminance,
              luminanceVariance: a.luminanceVariance,
              dominantColors: a.dominantColors,
              suggestedScrimOpacity: a.suggestedScrimOpacity,
              lqip: a.lqip,
              attribution: { photographer: "Your album", source: c.name, license: "Your own photos", sourceUrl: "" },
              sortOrder: order++,
            },
          });
          added++;
        } catch (err) {
          if (err instanceof UnsafeUrlError) throw err;
          rejected++; // undersized or unreadable image; keep going
        }
      }
      // Remove wallpapers (rows + files) no longer in the album.
      const stale = await prisma.wallpaper.findMany({ where: { collectionId: c.id }, select: { id: true, basePath: true } });
      for (const w of stale) {
        const name = w.basePath.split("/").pop()!;
        if (!keep.has(name)) {
          await prisma.wallpaper.delete({ where: { id: w.id } });
          for (const f of await readdir(dir).catch(() => [] as string[])) {
            if (f.startsWith(`${name}-`)) await rm(path.join(dir, f), { force: true });
          }
        }
      }
      const total = await prisma.wallpaper.count({ where: { collectionId: c.id } });
      await prisma.wallpaperCollection.update({
        where: { id: c.id },
        data: { lastSyncedAt: new Date(), lastError: total === 0 ? "No usable images — wallpapers need at least 1920px on the long edge." : rejected > 0 ? `${rejected} image(s) skipped (too small or unreadable)` : null },
      });
      log.info("custom collection synced", { collectionId: c.id, added, rejected, total });
    } catch (err) {
      const text = (err instanceof Error ? err.message : "unknown error").replace(/https?:\/\/\S+/g, "[link]").slice(0, 255);
      await prisma.wallpaperCollection.update({ where: { id: c.id }, data: { lastError: text } }).catch(() => undefined);
      log.warn("custom collection sync failed", { collectionId: c.id, error: text });
    }
  }
}
