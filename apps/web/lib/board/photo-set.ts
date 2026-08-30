import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** One entry of public/login-photos/credits.json (written by scripts/fetch-login-photos.mjs). */
export type PhotoEntry = {
  file: string;
  sizes: Array<{ w: number; file: string }>;
  photographer: string;
  source: string;
  license: string;
  lowRes: boolean;
};

let cache: PhotoEntry[] | null = null;

/** The bundled sample/login photo set, read once per process. */
export function loginPhotoSet(): PhotoEntry[] {
  if (cache) return cache;
  try {
    const dir = path.join(process.cwd(), "public", "login-photos");
    const raw = JSON.parse(readFileSync(path.join(dir, "credits.json"), "utf8")) as PhotoEntry[];
    cache = raw
      .map((p) => ({ ...p, sizes: (p.sizes ?? []).filter((s) => existsSync(path.join(dir, s.file))) }))
      .filter((p) => p.sizes.length > 0);
  } catch {
    cache = [];
  }
  return cache;
}

/** Largest available variant — for full-bleed uses. */
export function largestSrc(p: PhotoEntry): string {
  const best = [...p.sizes].sort((a, b) => b.w - a.w)[0]!;
  return `/login-photos/${best.file}`;
}

/** srcset string for responsive rendering. */
export function srcSet(p: PhotoEntry): string {
  return p.sizes.map((s) => `/login-photos/${s.file} ${s.w}w`).join(", ");
}
