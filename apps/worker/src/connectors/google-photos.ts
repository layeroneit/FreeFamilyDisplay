/**
 * Photo sources from a pasted Google link (operator: day-1 link path, no
 * OAuth). Two shapes:
 *
 * 1. Google Photos shared album — photos.app.goo.gl/… or
 *    photos.google.com/share/…  The album's public page embeds the image
 *    base URLs; we read them and size them. Best effort: if Google changes
 *    the page, we report that plainly instead of going blank.
 * 2. Google Drive folder shared "anyone with the link" — drive.google.com/
 *    drive/folders/<id>. Needs GOOGLE_API_KEY (instance-wide, free); files
 *    are listed and fetched with alt=media.
 *
 * Every fetch goes through the SSRF guard; images are cached locally (never
 * hotlinked) under MEDIA_DIR/photos/<widgetId>/.
 */

import { createHash } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { safeFetch, UnsafeUrlError } from "../net/ssrf.js";

/**
 * Ceiling for a photo WIDGET. Raised from 40 after the operator pointed a
 * 4,000-photo album at a wall and saw the same twenty pictures: 40 was a
 * renderer limit dressed up as a source limit, and the renderer no longer
 * mounts every image at once (see components/board/photos.tsx).
 *
 * A Drive folder genuinely reaches this number because it pages. A Google
 * Photos ALBUM link usually will not, and that is not a bug we can fix here:
 * the album page lazy-loads, so a single fetch only ever sees the first batch
 * of image URLs. Drive is the honest route to thousands.
 */
export const MAX_PHOTOS = 400;

/**
 * Wallpaper collections are curated sets meant to rotate weekly, not archives,
 * and every one of them is resized and analysed at ingest. They keep the old,
 * much smaller ceiling.
 */
export const MAX_COLLECTION_PHOTOS = 60;

/** Drive returns at most 1000 per call; 100 keeps each response small. */
const DRIVE_PAGE_SIZE = 100;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Shortest side below this is an avatar or an icon, not a photo. */
const MIN_PHOTO_PX = 500;
/**
 * Mean per-channel standard deviation (0–255) below which an image is flat
 * colour rather than a photograph. Measured against the operator's own
 * 40-photo album on 2026-08-30: the least varied real photo scored 30.8 and
 * the most varied 71.8, so 18 sits well clear of anything genuine while a
 * single-colour letter tile scores in the low teens.
 */
const MIN_PHOTO_STDEV = 18;

export type PhotoSourceKind = "google-photos" | "google-drive";

export function classifyLink(url: string): PhotoSourceKind | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const h = u.hostname.toLowerCase();
  if (h === "photos.app.goo.gl" || h === "photos.google.com") return "google-photos";
  if (h === "drive.google.com" && /\/folders\/[A-Za-z0-9_-]+/.test(u.pathname)) return "google-drive";
  return null;
}

/** Image base URLs from a shared-album page. Pure; unit-tested. */
export function extractAlbumImageUrls(html: string): string[] {
  const seen = new Set<string>();
  const re = /https:\/\/lh3\.googleusercontent\.com\/[A-Za-z0-9_\-./]+/g;
  for (const m of html.matchAll(re)) {
    // Strip any size suffix (=w123-h456…) so we can ask for our own.
    const base = m[0].split("=")[0]!;
    // Album pages also embed tiny avatar/profile images; those are short paths.
    if (base.length < 60) continue;
    // Profile pictures — including the coloured letter tile Google generates
    // for an account with no photo — live under /a/ and /a-/. One of those
    // stretched across a wall display is unmistakable and not a family photo.
    if (/^https:\/\/lh3\.googleusercontent\.com\/a[/-]/.test(base)) continue;
    seen.add(base);
    if (seen.size >= MAX_PHOTOS) break; // only a ceiling now, not the usual stop
  }
  return [...seen];
}

export function driveFolderId(url: string): string | null {
  const m = /\/folders\/([A-Za-z0-9_-]+)/.exec(url);
  return m?.[1] ?? null;
}

/**
 * Lists a shared Drive folder, FOLLOWING THE PAGE TOKEN. Without this loop a
 * folder of four thousand photos returned only the first page and the wall
 * showed the same handful forever.
 */
async function listDriveFolder(folderId: string, limit = MAX_PHOTOS): Promise<string[]> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("Google Drive folders need GOOGLE_API_KEY in .env — Google Photos album links work without it.");
  const q = encodeURIComponent(`'${folderId}' in parents and mimeType contains 'image/' and trashed = false`);
  const out: string[] = [];
  let pageToken: string | undefined;
  // Bounded by `limit`, and by a page ceiling so a malformed token that never
  // changes cannot spin forever.
  for (let page = 0; page < Math.ceil(limit / DRIVE_PAGE_SIZE) + 1 && out.length < limit; page++) {
    const size = Math.min(DRIVE_PAGE_SIZE, limit - out.length);
    const tok = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id)&pageSize=${size}&orderBy=name_natural${tok}&key=${encodeURIComponent(key)}`;
    const res = await safeFetch(url, { accept: "application/json" });
    if (res.status !== 200) throw new Error(`Google Drive answered HTTP ${res.status} — is the folder shared with "anyone with the link"?`);
    const body = JSON.parse(res.body.toString("utf8")) as { files?: Array<{ id: string }>; nextPageToken?: string };
    for (const f of body.files ?? []) {
      if (out.length >= limit) break;
      out.push(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}?alt=media&key=${encodeURIComponent(key)}`);
    }
    if (!body.nextPageToken || body.nextPageToken === pageToken) break;
    pageToken = body.nextPageToken;
  }
  return out;
}

async function resolveAlbum(link: string): Promise<string[]> {
  const page = await safeFetch(link, { accept: "text/html" });
  if (page.status !== 200) throw new Error(`Google Photos answered HTTP ${page.status} — is the album still shared?`);
  const urls = extractAlbumImageUrls(page.body.toString("utf8"));
  if (urls.length === 0) throw new Error("Couldn't read that album — Google may have changed the page. A Drive folder link is the reliable alternative.");
  return urls.map((u) => `${u}=w2048-h2048`);
}

/**
 * Rejects what an album page yields that isn't a family photo. Two signals,
 * both cheap:
 *
 *  - Size. An icon or a sprite is small on its short side.
 *  - Flatness. Google renders an account with no profile picture as a single
 *    coloured square with one letter on it; blown up to fill a wall display
 *    it is unmistakable. A photograph varies across every channel, a letter
 *    tile barely varies at all, so a low standard deviation gives it away
 *    where dimensions and file size cannot.
 */
async function isRealPhoto(file: string): Promise<boolean> {
  try {
    const img = sharp(file);
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return false;
    if (Math.min(meta.width, meta.height) < MIN_PHOTO_PX) return false;
    const { channels } = await img.stats();
    const rgb = channels.slice(0, 3);
    if (rgb.length === 0) return false;
    const spread = rgb.reduce((sum, c) => sum + c.stdev, 0) / rgb.length;
    return spread >= MIN_PHOTO_STDEV;
  } catch {
    // Unreadable file: not something to put on the wall either.
    return false;
  }
}

/**
 * Syncs one photo widget's link into the local cache. Returns the cached
 * file names in display order. Throws with an actionable message.
 */
export async function syncPhotoLink(link: string, widgetId: string, mediaDir: string): Promise<string[]> {
  const kind = classifyLink(link);
  if (!kind) throw new Error("Paste a Google Photos shared-album link or a Google Drive folder link.");
  const urls = kind === "google-photos" ? await resolveAlbum(link) : await listDriveFolder(driveFolderId(link)!);

  const dir = path.join(mediaDir, "photos", widgetId);
  await mkdir(dir, { recursive: true });
  const keep = new Set<string>();
  const files: string[] = [];
  for (const u of urls.slice(0, MAX_PHOTOS)) {
    const name = `${createHash("sha256").update(u.split("?")[0]!).digest("hex").slice(0, 24)}.jpg`;
    const abs = path.join(dir, name);
    const existing = await readdir(dir).catch(() => [] as string[]);
    const cached = existing.includes(name);
    try {
      if (!cached) {
        const img = await safeFetch(u, { accept: "image/*", maxBytes: MAX_IMAGE_BYTES });
        if (img.status !== 200 || !img.contentType.startsWith("image/")) continue;
        // Re-encode rather than writing the source bytes through. Two reasons:
        //
        // 1. EXIF. Photos carry camera make and model, software version, and
        //    sometimes GPS. sharp drops all of it unless asked to keep it, so
        //    re-encoding strips the lot. This path used to write source bytes
        //    verbatim, which was harmless only by luck -- Google renditions
        //    arrive metadata-free, but any other source (an iCloud shared
        //    album, a phone upload) does not. The wallpaper path has always
        //    stripped; now this one matches it.
        // 2. Orientation. .rotate() with no argument bakes in the EXIF
        //    orientation before that tag is discarded, so a photo taken
        //    sideways stays upright instead of flipping once the tag is gone.
        await sharp(img.body).rotate().jpeg({ quality: 88 }).toFile(abs);
      }
      // Re-checked on every sync, not just on download: an image cached before
      // this rule existed has to be able to fall out of the set.
      if (!(await isRealPhoto(abs))) {
        await rm(abs, { force: true });
        continue;
      }
      keep.add(name);
      files.push(name);
    } catch (err) {
      if (err instanceof UnsafeUrlError) throw err;
      // One bad image shouldn't sink the album.
    }
  }
  // Drop cached files no longer in the album.
  for (const f of await readdir(dir).catch(() => [] as string[])) {
    if (!keep.has(f)) await rm(path.join(dir, f), { force: true });
  }
  return files;
}
