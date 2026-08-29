/**
 * Downloads, processes, and self-hosts the login-page photography.
 *
 * Reads scripts/login-photos.json, fetches each `url`, resizes to 1600px wide
 * WebP (EXIF stripped — sharp drops metadata unless asked to keep it), and
 * writes apps/web/public/login-photos/<file> plus credits.json. The login page
 * renders a gradient when this has never run — photos are an enhancement, not
 * a dependency.
 *
 * Run from the repo root:  node scripts/fetch-login-photos.mjs
 * Idempotent: existing files are re-processed in place.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "apps", "web", "public", "login-photos");
const MANIFEST = path.join(ROOT, "scripts", "login-photos.json");

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const photos = manifest.photos ?? [];

if (photos.length === 0) {
  process.stdout.write(
    "login-photos.json has no entries yet — add hand-picked, licensed image URLs first.\n" +
      "The login page shows its gradient fallback until then.\n",
  );
  process.exit(0);
}

await mkdir(OUT_DIR, { recursive: true });
const credits = [];

for (const photo of photos) {
  const { url, file, photographer, source, license } = photo;
  if (!url || !file || !photographer || !source || !license) {
    process.stderr.write(`skipping incomplete entry: ${JSON.stringify(photo)}\n`);
    continue;
  }
  process.stdout.write(`fetching ${file} …\n`);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    process.stderr.write(`  ${res.status} from source — skipped\n`);
    continue;
  }
  const input = Buffer.from(await res.arrayBuffer());
  const out = await sharp(input)
    .rotate() // apply EXIF orientation before the metadata is dropped
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
  await writeFile(path.join(OUT_DIR, file), out);
  credits.push({ file, photographer, source, license });
  process.stdout.write(`  ok (${Math.round(out.length / 1024)} KB)\n`);
}

await writeFile(path.join(OUT_DIR, "credits.json"), JSON.stringify(credits, null, 2));
process.stdout.write(`done — ${credits.length} photo(s), credits.json written.\n`);
