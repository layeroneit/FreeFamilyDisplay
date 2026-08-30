/**
 * Wallpaper collections filled from a folder on the host instead of a share
 * link. The operator drops image files into a sub-directory of the drop root
 * (WALLPAPER_DROP_DIR, mounted read-only into this container) and points a
 * collection at that directory by name; the worker ingests whatever is there
 * on each connector cycle, so adding a file adds a wallpaper.
 *
 * This is the path for art the household already has on disk. Nothing leaves
 * the machine and nothing is fetched, so there is no SSRF surface here — the
 * safety property that matters instead is that `sourceFolder` is a bare
 * directory NAME. It is validated against a strict pattern and joined under
 * the drop root, then the resolved path is re-checked, so a crafted value
 * cannot walk out of the drop directory and read the rest of the container.
 */

import { createHash } from "node:crypto";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@ffd/db";
import { createLogger } from "@ffd/log";
import { ingestWallpaper } from "../wallpaper-ingest.js";

const log = createLogger("worker.folders");
const MAX_IMAGE_BYTES = 24 * 1024 * 1024;
const MAX_PER_FOLDER = 60;
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".tif", ".tiff"]);

/** A single path segment: letters, digits, dot, dash, underscore, space. */
const FOLDER_NAME = /^[A-Za-z0-9 ._-]{1,64}$/;

export function dropRoot(): string {
  return process.env.WALLPAPER_DROP_DIR ?? "/app/drop";
}

/**
 * Resolves a collection's folder inside the drop root, or null if the name is
 * not a plain segment or resolves outside the root. Exported for tests.
 */
export function resolveDropFolder(root: string, name: string): string | null {
  if (!FOLDER_NAME.test(name)) return null;
  if (name === "." || name === "..") return null;
  const abs = path.resolve(root, name);
  const rootAbs = path.resolve(root);
  if (abs !== path.join(rootAbs, name)) return null;
  if (!abs.startsWith(rootAbs + path.sep)) return null;
  return abs;
}

/** Sub-directories of the drop root the operator can pick from. */
export async function listDropFolders(): Promise<Array<{ name: string; images: number }>> {
  const root = dropRoot();
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const out: Array<{ name: string; images: number }> = [];
  for (const e of entries) {
    if (!e.isDirectory() || !FOLDER_NAME.test(e.name)) continue;
    const files = await readdir(path.join(root, e.name)).catch(() => [] as string[]);
    out.push({ name: e.name, images: files.filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase())).length });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function syncFolderCollections(mediaDir: string): Promise<void> {
  const cols = await prisma.wallpaperCollection.findMany({
    where: { isBuiltin: false, sourceFolder: { not: null } },
    select: { id: true, sourceFolder: true, name: true },
  });
  for (const c of cols) {
    try {
      const src = resolveDropFolder(dropRoot(), c.sourceFolder!);
      if (!src) throw new Error("That folder name isn't allowed — use a plain name like demon-slayer.");
      const entries = await readdir(src).catch(() => {
        throw new Error(`No folder named "${c.sourceFolder}" in the drop directory on the server.`);
      });
      const images = entries.filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase())).sort();
      if (images.length === 0) throw new Error("That folder has no image files in it yet.");

      const dir = path.join(mediaDir, "wallpapers", c.id);
      const keep = new Set<string>();
      let order = 0;
      let added = 0;
      let rejected = 0;
      for (const f of images.slice(0, MAX_PER_FOLDER)) {
        const abs = path.join(src, f);
        // The stored name has to change when the file's contents change, or a
        // replaced image would keep serving the old renditions.
        const st = await stat(abs).catch(() => null);
        if (!st?.isFile()) continue;
        if (st.size > MAX_IMAGE_BYTES) {
          rejected++;
          continue;
        }
        // 24 hex characters total, because that is exactly what the media
        // route's filename pattern admits. Leading "f" marks a folder-sourced
        // image; the rest hashes name+size+mtime so replacing a file in place
        // produces a new name and new renditions rather than serving the old.
        const name = `f${createHash("sha256").update(`${f}:${st.size}:${Math.floor(st.mtimeMs)}`).digest("hex").slice(0, 23)}`;
        const basePath = `/media/wallpapers/${c.id}/${name}`;
        keep.add(name);
        const existing = await prisma.wallpaper.findFirst({ where: { collectionId: c.id, basePath }, select: { id: true } });
        if (existing) {
          await prisma.wallpaper.update({ where: { id: existing.id }, data: { sortOrder: order++ } });
          continue;
        }
        try {
          const a = await ingestWallpaper(await readFile(abs), dir, name);
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
              attribution: { photographer: "", source: c.name, license: "", sourceUrl: "" },
              sortOrder: order++,
            },
          });
          added++;
        } catch {
          rejected++; // too small, or not an image the decoder accepts
        }
      }

      const stale = await prisma.wallpaper.findMany({ where: { collectionId: c.id }, select: { id: true, basePath: true } });
      for (const w of stale) {
        const name = w.basePath.split("/").pop()!;
        if (!keep.has(name)) {
          await prisma.wallpaper.delete({ where: { id: w.id } });
          for (const g of await readdir(dir).catch(() => [] as string[])) {
            if (g.startsWith(`${name}-`)) await rm(path.join(dir, g), { force: true });
          }
        }
      }

      const total = await prisma.wallpaper.count({ where: { collectionId: c.id } });
      await prisma.wallpaperCollection.update({
        where: { id: c.id },
        data: {
          lastSyncedAt: new Date(),
          lastError:
            total === 0
              ? "No usable images — wallpapers need at least 1920px on the long edge."
              : rejected > 0
                ? `${rejected} file(s) skipped (too small, too large, or not an image)`
                : null,
        },
      });
      log.info("folder collection synced", { collectionId: c.id, added, rejected, total });
    } catch (err) {
      const text = (err instanceof Error ? err.message : "unknown error").slice(0, 255);
      await prisma.wallpaperCollection.update({ where: { id: c.id }, data: { lastError: text } }).catch(() => undefined);
      log.warn("folder collection sync failed", { collectionId: c.id, error: text });
    }
  }
}
