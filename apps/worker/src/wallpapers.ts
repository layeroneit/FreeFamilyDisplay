/**
 * Wallpaper collections — seed + rotation (docs/specs/wallpaper-collections.md §3).
 *
 * Seed: on boot, upsert the built-in collections from the ingest manifest so a
 * fresh database has Deep space / Mountains / Muscle and machines available
 * immediately. Idempotent; re-running after adding photos adds them.
 *
 * Rotation: every cycle, advance boards whose interval has elapsed. Weekly
 * fires Monday 04:00 (server local), daily 04:00, monthly the 1st at 04:00.
 * Pinned holds; skipped is excluded; shuffle avoids repeats until the set is
 * exhausted. State lives on the board so every screen showing it changes
 * together; displays poll, we never push.
 */

import { readFile } from "node:fs/promises";
import { prisma } from "@ffd/db";
import type { WallpaperRotation } from "@ffd/db";
import { createLogger } from "@ffd/log";

const log = createLogger("worker.wallpapers");

type ManifestWallpaper = {
  basePath: string;
  width: number;
  height: number;
  meanLuminance: number;
  luminanceVariance: number;
  dominantColors: string[];
  suggestedScrimOpacity: number;
  lqip: string;
  attribution: { photographer: string; source: string; license: string; sourceUrl: string };
  sortOrder: number;
};
type Manifest = { collections: Array<{ slug: string; name: string; description: string | null; wallpapers: ManifestWallpaper[] }> };

export async function seedBuiltinWallpapers(): Promise<void> {
  const file = process.env.WALLPAPER_MANIFEST ?? "/app/wallpapers/manifest.json";
  let manifest: Manifest;
  try {
    manifest = JSON.parse(await readFile(file, "utf8")) as Manifest;
  } catch (err) {
    log.warn("wallpaper manifest not readable — built-ins not seeded", { file, error: err instanceof Error ? err.message : "unknown" });
    return;
  }
  let added = 0;
  for (const c of manifest.collections) {
    const col = await prisma.wallpaperCollection.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, name: c.name, description: c.description, isBuiltin: true },
      update: { name: c.name, description: c.description, isBuiltin: true },
      select: { id: true },
    });
    for (const w of c.wallpapers) {
      const existing = await prisma.wallpaper.findFirst({ where: { collectionId: col.id, basePath: w.basePath }, select: { id: true } });
      const data = {
        width: w.width,
        height: w.height,
        meanLuminance: w.meanLuminance,
        luminanceVariance: w.luminanceVariance,
        dominantColors: w.dominantColors,
        suggestedScrimOpacity: w.suggestedScrimOpacity,
        lqip: w.lqip,
        attribution: w.attribution,
        sortOrder: w.sortOrder,
      };
      if (existing) await prisma.wallpaper.update({ where: { id: existing.id }, data });
      else {
        await prisma.wallpaper.create({ data: { collectionId: col.id, basePath: w.basePath, ...data } });
        added++;
      }
    }
  }
  log.info("built-in wallpapers seeded", { collections: manifest.collections.length, added });
  await seedTagCollections();
}

/**
 * Built-in themes whose images are FETCHED rather than shipped.
 *
 * Everything else in the picker is backed by files committed to this repo.
 * These cannot be: the art belongs to the artists who drew it, this repo is
 * public, and committing it would make the project the redistributor. So the
 * theme ships as a NAME and a SEARCH, and each household's own instance fills
 * it in on its own disk if and when somebody picks it.
 *
 * That "if and when" is the point. syncTagCollections only fetches a built-in
 * tag theme once a board has actually selected it, so an install that never
 * touches these downloads nothing at all.
 *
 * The slug matters: `anime` is a key in lib/board/collection-fonts.ts, so
 * picking this theme also switches the board's lettering.
 */
const TAG_COLLECTIONS: Array<{ slug: string; name: string; description: string; tags: string; rightsNote: string }> = [
  {
    slug: "anime",
    name: "Anime",
    description: "Anime scenery, fetched to this machine on demand. Rights stay with the artists.",
    // Scenery over characters: it is what actually reads well across a room,
    // and it is the safest corner of a crowd-tagged index.
    tags: "scenery no_humans",
    rightsNote: "Fan art - rights remain with the original artists.",
  },
  {
    slug: "anime-titan",
    name: "Attack on Titan",
    description: "Fetched to this machine on demand. Rights remain with the original artists.",
    tags: "shingeki_no_kyojin",
    rightsNote: "Fan art - rights remain with the original artists. Personal display only.",
  },
  {
    slug: "anime-slayer",
    name: "Demon Slayer",
    description: "Fetched to this machine on demand. Rights remain with the original artists.",
    tags: "kimetsu_no_yaiba",
    rightsNote: "Fan art - rights remain with the original artists. Personal display only.",
  },
  {
    slug: "anime-night",
    name: "Anime nights",
    description: "Night streets, lanterns and starfields, fetched on demand. Rights stay with the artists.",
    tags: "scenery night no_humans",
    rightsNote: "Fan art - rights remain with the original artists.",
  },
];

async function seedTagCollections(): Promise<void> {
  for (const c of TAG_COLLECTIONS) {
    await prisma.wallpaperCollection.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, name: c.name, description: c.description, isBuiltin: true, sourceTags: c.tags, rightsNote: c.rightsNote },
      // Deliberately does NOT reset sourceTags: an operator who retuned the
      // tags on their own box should not have that undone by a restart.
      update: { name: c.name, description: c.description, isBuiltin: true },
      select: { id: true },
    });
  }
  log.info("tag-backed themes seeded", { count: TAG_COLLECTIONS.length });
}

/** Most recent 04:00 boundary for the interval, in server-local time. */
export function lastBoundary(rotation: WallpaperRotation, now: Date): Date | null {
  const d = new Date(now);
  d.setHours(4, 0, 0, 0);
  if (rotation === "MANUAL") return null;
  // Sub-daily rotations are derived from the clock at render time (see
  // apps/web/lib/board/wallpapers.ts). The worker must not also advance a
  // pointer for them, or the two would fight and the board would jump.
  if (rotation === "EVERY_5_MIN" || rotation === "EVERY_15_MIN" || rotation === "EVERY_30_MIN" || rotation === "HOURLY") return null;
  if (rotation === "DAILY") {
    if (d > now) d.setDate(d.getDate() - 1);
    return d;
  }
  if (rotation === "WEEKLY") {
    // Back to Monday.
    const dow = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - dow);
    if (d > now) d.setDate(d.getDate() - 7);
    return d;
  }
  // MONTHLY
  d.setDate(1);
  if (d > now) d.setMonth(d.getMonth() - 1);
  return d;
}

export function isDue(rotation: WallpaperRotation, lastRotatedAt: Date | null, now: Date): boolean {
  const boundary = lastBoundary(rotation, now);
  if (!boundary) return false;
  return lastRotatedAt === null || lastRotatedAt < boundary;
}

/** Picks the next wallpaper id. Pure; unit-tested. */
export function pickNext(
  candidates: Array<{ id: string; sortOrder: number }>,
  currentId: string | null,
  order: "SEQUENTIAL" | "SHUFFLE",
  shown: string[],
  random: () => number = Math.random,
): { id: string | null; shown: string[] } {
  if (candidates.length === 0) return { id: null, shown: [] };
  const sorted = [...candidates].sort((a, b) => a.sortOrder - b.sortOrder);
  if (order === "SEQUENTIAL") {
    const i = sorted.findIndex((c) => c.id === currentId);
    const next = sorted[(i + 1) % sorted.length]!;
    return { id: next.id, shown: [] };
  }
  const ids = new Set(sorted.map((c) => c.id));
  let remaining = sorted.filter((c) => !shown.includes(c.id) && c.id !== currentId);
  let nextShown = shown.filter((s) => ids.has(s));
  if (remaining.length === 0) {
    remaining = sorted.filter((c) => c.id !== currentId);
    nextShown = [];
    if (remaining.length === 0) remaining = sorted;
  }
  const pick = remaining[Math.floor(random() * remaining.length)]!;
  return { id: pick.id, shown: [...nextShown, pick.id] };
}

/** Advances one board now (rotation tick, or the operator's "next"/"skip"). */
export async function advanceBoard(boardId: string, opts: { force?: boolean } = {}): Promise<boolean> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      wallpaperCollectionId: true,
      wallpaperRotation: true,
      wallpaperOrder: true,
      currentWallpaperId: true,
      lastRotatedAt: true,
      style: true,
    },
  });
  if (!board?.wallpaperCollectionId) return false;
  // Pin/skip are PER BOARD (style JSON): built-in collections are shared, so
  // the Wallpaper row flags from the spec would leak one household's taste to
  // every other.
  const style = (board.style && typeof board.style === "object" ? board.style : {}) as Record<string, unknown>;
  const shown = Array.isArray(style["wallpaperShown"]) ? (style["wallpaperShown"] as string[]) : [];
  const skipped = Array.isArray(style["wallpaperSkipped"]) ? (style["wallpaperSkipped"] as string[]) : [];
  const pinned = typeof style["wallpaperPinned"] === "string" ? (style["wallpaperPinned"] as string) : null;
  if (!opts.force) {
    if (pinned && pinned === board.currentWallpaperId) return false;
    if (!isDue(board.wallpaperRotation, board.lastRotatedAt, new Date())) return false;
  }
  const candidates = await prisma.wallpaper.findMany({
    where: { collectionId: board.wallpaperCollectionId, id: { notIn: skipped } },
    select: { id: true, sortOrder: true },
  });
  const next = pickNext(candidates, board.currentWallpaperId, board.wallpaperOrder, shown);
  await prisma.board.update({
    where: { id: board.id },
    data: { currentWallpaperId: next.id, lastRotatedAt: new Date(), style: { ...style, wallpaperShown: next.shown } },
  });
  return true;
}

/**
 * Moves a board to a different THEME - the outer loop, weekly.
 *
 * Two rotations are nested here and they must not be confused. The inner loop
 * changes the PHOTO inside a collection and is either clock-derived (every 5
 * minutes and friends) or advanced by advanceBoard() on a 4am boundary. This
 * one changes WHICH COLLECTION the board is showing at all, once a week.
 *
 * Shuffled without repeats across the built-ins, reusing pickNext so the
 * "don't repeat until the set is exhausted" rule is written once. The set of
 * already-shown collections lives on the board, like the image-level one,
 * because built-in collections are shared and per-board taste must not leak
 * between households.
 */
export async function advanceCollection(boardId: string, opts: { force?: boolean } = {}): Promise<boolean> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, cycleCollections: true, wallpaperCollectionId: true, lastCollectionRotatedAt: true, style: true },
  });
  if (!board?.cycleCollections) return false;
  if (!opts.force && !isDue("WEEKLY", board.lastCollectionRotatedAt, new Date())) return false;

  // Built-ins only: a household's own collections are a deliberate choice, not
  // something to be cycled away from without being asked.
  const collections = await prisma.wallpaperCollection.findMany({
    where: { isBuiltin: true, wallpapers: { some: {} } },
    orderBy: { slug: "asc" },
    select: { id: true },
  });
  if (collections.length < 2) return false;

  const style = (board.style && typeof board.style === "object" ? board.style : {}) as Record<string, unknown>;
  const shown = Array.isArray(style["collectionsShown"]) ? (style["collectionsShown"] as string[]) : [];
  const next = pickNext(
    collections.map((c, i) => ({ id: c.id, sortOrder: i })),
    board.wallpaperCollectionId,
    "SHUFFLE",
    shown,
  );
  if (!next.id || next.id === board.wallpaperCollectionId) return false;

  await prisma.board.update({
    where: { id: board.id },
    data: {
      wallpaperCollectionId: next.id,
      lastCollectionRotatedAt: new Date(),
      // The image-level state all referred to the OLD collection. A pin in
      // particular points at an image this board can no longer show, and
      // leaving it set would freeze the new theme on its fallback image.
      currentWallpaperId: null,
      lastRotatedAt: null,
      style: { ...style, collectionsShown: next.shown, wallpaperShown: [], wallpaperPinned: null },
    },
  });
  return true;
}

export async function runCollectionCycle(): Promise<void> {
  const boards = await prisma.board.findMany({ where: { cycleCollections: true }, select: { id: true } });
  let moved = 0;
  for (const b of boards) {
    try {
      if (await advanceCollection(b.id)) moved++;
    } catch (err) {
      log.warn("collection rotation failed", { boardId: b.id, error: err instanceof Error ? err.message : "unknown" });
    }
  }
  if (moved > 0) log.info("board themes rotated", { boards: moved });
}

export async function runWallpaperCycle(): Promise<void> {
  // The theme moves first: if this is the week's changeover, the image-level
  // pass below should already be working inside the new collection.
  await runCollectionCycle();
  const boards = await prisma.board.findMany({
    where: { wallpaperCollectionId: { not: null }, wallpaperRotation: { not: "MANUAL" } },
    select: { id: true },
  });
  let rotated = 0;
  for (const b of boards) {
    try {
      if (await advanceBoard(b.id)) rotated++;
    } catch (err) {
      log.warn("wallpaper rotation failed", { boardId: b.id, error: err instanceof Error ? err.message : "unknown" });
    }
  }
  if (rotated > 0) log.info("wallpapers rotated", { boards: rotated });
}
