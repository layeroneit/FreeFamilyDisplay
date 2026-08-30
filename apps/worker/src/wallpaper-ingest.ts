/**
 * Wallpaper analysis + resize for CUSTOM collections (spec §2, §4) — the
 * worker-side twin of scripts/ingest-wallpapers.mjs. Same math, same outputs:
 * mean luminance, luminance variance, a 5-swatch palette, the spec's scrim
 * formula, a 24px LQIP, EXIF stripped, WebP at 1920 and 2560.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const WALLPAPER_WIDTHS = [1920, 2560] as const;
export const MIN_LONG_EDGE = 1920;

export type Analysis = {
  width: number;
  height: number;
  meanLuminance: number;
  luminanceVariance: number;
  dominantColors: string[];
  suggestedScrimOpacity: number;
  lqip: string;
};

const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));

/** Spec §2 formula. */
export function suggestedScrim(meanLum: number, lumVar: number): number {
  return +clamp(0.18, 0.62, 0.3 + meanLum * 0.35 + lumVar * 0.25).toFixed(3);
}

export async function analyze(input: Buffer): Promise<Omit<Analysis, "width" | "height" | "lqip">> {
  const { data, info } = await sharp(input).rotate().resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  let sum = 0;
  const lums = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 3]! / 255;
    const g = data[i * 3 + 1]! / 255;
    const b = data[i * 3 + 2]! / 255;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lums[i] = l;
    sum += l;
  }
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) varSum += (lums[i]! - mean) ** 2;
  const stdev = Math.sqrt(varSum / n);

  const counts = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const q = [data[i * 3]!, data[i * 3 + 1]!, data[i * 3 + 2]!].map((c) => Math.round(c / 51) * 51);
    const key = q.join(",");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k.split(",").map(Number));
  const picked: number[][] = [];
  for (const c of ranked) {
    if (picked.every((p) => Math.hypot(p[0]! - c[0]!, p[1]! - c[1]!, p[2]! - c[2]!) > 60)) picked.push(c);
    if (picked.length === 5) break;
  }
  const hex = (c: number[]) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  const meanLuminance = +mean.toFixed(4);
  const luminanceVariance = +stdev.toFixed(4);
  return { meanLuminance, luminanceVariance, dominantColors: picked.map(hex), suggestedScrimOpacity: suggestedScrim(meanLuminance, luminanceVariance) };
}

/**
 * Writes <dir>/<name>-1920.webp and -2560.webp (never enlarging) plus returns
 * the analysis. Throws with an actionable message for undersized sources.
 */
export async function ingestWallpaper(input: Buffer, dir: string, name: string): Promise<Analysis> {
  const meta = await sharp(input).rotate().metadata();
  const long = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (long < MIN_LONG_EDGE) throw new Error(`Image is ${meta.width}×${meta.height}; wallpapers need at least ${MIN_LONG_EDGE}px on the long edge`);
  await mkdir(dir, { recursive: true });
  let width = 0;
  let height = 0;
  for (const w of WALLPAPER_WIDTHS) {
    const out = await sharp(input).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 74 }).toBuffer({ resolveWithObject: true });
    await writeFile(path.join(dir, `${name}-${w}.webp`), out.data);
    if (w === 1920) {
      width = out.info.width;
      height = out.info.height;
    }
  }
  const lqipBuf = await sharp(input).rotate().resize({ width: 24 }).webp({ quality: 40 }).toBuffer();
  const stats = await analyze(input);
  return { width, height, ...stats, lqip: `data:image/webp;base64,${lqipBuf.toString("base64")}` };
}
