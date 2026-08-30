/**
 * Wallpaper ingest (docs/specs/wallpaper-collections.md §2, §4).
 *
 * For every image in scripts/wallpapers.json:
 *   - load from a local `file` (already downloaded and reviewed) or fetch `url`
 *   - reject anything under 1920px on the long edge, loudly
 *   - strip EXIF, emit WebP at 1920 and 2560 widths (AVIF/JPEG ladder: later)
 *   - measure mean luminance + luminance variance, extract 5 dominant colors,
 *     compute the suggested scrim opacity (spec formula), build a 24px LQIP
 *   - write apps/web/public/wallpapers/<collection>/<name>-<w>.webp
 *   - write apps/web/public/wallpapers/manifest.json — the seed the worker
 *     upserts into WallpaperCollection/Wallpaper on boot
 *
 * Run from the repo root:  node scripts/ingest-wallpapers.mjs
 * Idempotent: re-running re-processes in place.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "apps", "web", "public", "wallpapers");
const MANIFEST_IN = path.join(ROOT, "scripts", "wallpapers.json");
const WIDTHS = [1920, 2560];
const MIN_LONG_EDGE = 1920;

const clamp = (lo, hi, v) => Math.min(hi, Math.max(lo, v));

/** Spec §2 formula. */
function suggestedScrim(meanLum, lumVar) {
  return clamp(0.18, 0.62, 0.3 + meanLum * 0.35 + lumVar * 0.25);
}

/** Luminance stats + palette from a small raw RGB sample. */
async function analyze(input) {
  const { data, info } = await sharp(input).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  let sum = 0;
  const lums = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 3] / 255, g = data[i * 3 + 1] / 255, b = data[i * 3 + 2] / 255;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lums[i] = l;
    sum += l;
  }
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) varSum += (lums[i] - mean) ** 2;
  const variance = varSum / n; // 0..0.25 in practice; spec formula expects this scale
  const stdev = Math.sqrt(variance);

  // Dominant colors: quantize to a 6-level cube, count, take the top 5 that
  // are visibly distinct from each other.
  const counts = new Map();
  for (let i = 0; i < n; i++) {
    const q = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]].map((c) => Math.round(c / 51) * 51);
    const key = q.join(",");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k.split(",").map(Number));
  const picked = [];
  for (const c of ranked) {
    if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 60)) picked.push(c);
    if (picked.length === 5) break;
  }
  const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  return { meanLuminance: +mean.toFixed(4), luminanceVariance: +stdev.toFixed(4), dominantColors: picked.map(hex) };
}

async function loadSource(img) {
  if (img.file) return readFile(path.join(ROOT, img.file));
  const res = await fetch(img.url, { headers: { "user-agent": "FreeFamilyDisplay-ingest/0.1" }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${img.url}`);
  return Buffer.from(await res.arrayBuffer());
}

const manifest = JSON.parse(await readFile(MANIFEST_IN, "utf8"));
const out = { generatedAt: new Date().toISOString(), collections: [] };
let ok = 0, failed = 0;

for (const col of manifest.collections) {
  const dir = path.join(OUT, col.slug);
  await mkdir(dir, { recursive: true });
  const wallpapers = [];
  let order = 0;
  for (const img of col.images) {
    process.stdout.write(`${col.slug}/${img.name} … `);
    try {
      const src = await loadSource(img);
      const meta = await sharp(src).metadata();
      const long = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (long < MIN_LONG_EDGE) throw new Error(`too small: ${meta.width}×${meta.height} (need ${MIN_LONG_EDGE}px on the long edge)`);

      const base = `/wallpapers/${col.slug}/${img.name}`;
      let width = 0, height = 0;
      for (const w of WIDTHS) {
        const info = await sharp(src).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 74 }).toFile(path.join(dir, `${img.name}-${w}.webp`));
        if (w === 1920) { width = info.width; height = info.height; }
      }
      const lqipBuf = await sharp(src).rotate().resize({ width: 24 }).webp({ quality: 40 }).toBuffer();
      const lqip = `data:image/webp;base64,${lqipBuf.toString("base64")}`;
      const stats = await analyze(src);
      const scrim = +suggestedScrim(stats.meanLuminance, stats.luminanceVariance).toFixed(3);

      wallpapers.push({
        basePath: base,
        width,
        height,
        ...stats,
        suggestedScrimOpacity: scrim,
        lqip,
        attribution: { photographer: img.photographer, source: img.source, license: img.license, sourceUrl: img.url },
        sortOrder: order++,
      });
      ok++;
      process.stdout.write(`ok  lum=${stats.meanLuminance} var=${stats.luminanceVariance} scrim=${scrim} text=${stats.meanLuminance > 0.5 ? "dark" : "light"}\n`);
    } catch (err) {
      failed++;
      process.stdout.write(`FAILED — ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
  out.collections.push({ slug: col.slug, name: col.name, description: col.description ?? null, wallpapers });
}

await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(out, null, 2));
process.stdout.write(`done — ${ok} wallpaper(s), ${failed} failed. manifest: ${path.relative(ROOT, path.join(OUT, "manifest.json"))}\n`);
process.exit(failed > 0 ? 1 : 0);
