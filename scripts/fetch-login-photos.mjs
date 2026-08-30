/**
 * Downloads, processes, and self-hosts the login-page photography.
 *
 * Reads scripts/login-photos.json, fetches each `url` (a browser-style
 * user agent — Wikimedia refuses anonymous clients), applies EXIF orientation,
 * strips metadata, and emits WebP at 1920 and 2560 widths (never enlarging —
 * an upscaled 1024px source is exactly the grain the operator saw). Writes
 * apps/web/public/login-photos/<file>-<w>.webp plus credits.json, which the
 * page uses to build a srcset so 4K and ultrawide screens get the sharp copy.
 *
 * Run from the repo root:  npm run photos:login
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "apps", "web", "public", "login-photos");
const MANIFEST = path.join(ROOT, "scripts", "login-photos.json");
const WIDTHS = [1920, 2560];
const UA = "FreeFamilyDisplay-ingest/0.1 (self-hosted family dashboard)";

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const photos = manifest.photos ?? [];
if (photos.length === 0) {
  process.stdout.write("login-photos.json has no entries — the login page shows its gradient fallback.\n");
  process.exit(0);
}

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });
const credits = [];
let failed = 0;

for (const photo of photos) {
  const { url, file, photographer, source, license } = photo;
  if (!url || !file || !photographer || !source || !license) {
    process.stderr.write(`skipping incomplete entry: ${JSON.stringify(photo)}\n`);
    failed++;
    continue;
  }
  process.stdout.write(`${file} … `);
  try {
    let input;
    if (photo.localFile) {
      // Reviewed original already on disk (kept out of git) — skip the network.
      input = await readFile(path.join(ROOT, photo.localFile));
    } else {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000), headers: { "user-agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      input = Buffer.from(await res.arrayBuffer());
    }
    const meta = await sharp(input).rotate().metadata();
    const native = meta.width ?? 0;
    const sizes = [];
    for (const w of WIDTHS) {
      if (w > native && sizes.length > 0) break; // don't emit two identical native-size copies
      const info = await sharp(input).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(OUT_DIR, `${file}-${w}.webp`));
      sizes.push({ w: info.width, file: `${file}-${w}.webp` });
    }
    credits.push({ file, sizes, photographer, source, license, lowRes: native < 1600 });
    process.stdout.write(`ok (native ${native}px → ${sizes.map((s) => s.w).join("/")})\n`);
  } catch (err) {
    failed++;
    process.stdout.write(`FAILED — ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

await writeFile(path.join(OUT_DIR, "credits.json"), JSON.stringify(credits, null, 2));
process.stdout.write(`done — ${credits.length} photo(s), ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
