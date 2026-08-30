/**
 * Wallpaper collections — read side for the app (spec §8 tenancy: built-in OR
 * owned). Rotation/advance logic lives in the worker; the app asks it to
 * advance and never duplicates that logic.
 */

import "server-only";
import { prisma } from "@ffd/db";
import type { BoardFull } from "./boards";
import { patchBoardStyle } from "./boards";

export type WallpaperInfo = {
  id: string;
  basePath: string;
  width: number;
  height: number;
  meanLuminance: number;
  suggestedScrimOpacity: number;
  dominantColors: string[];
  lqip: string;
  attribution: { photographer: string; source: string; license: string; sourceUrl: string };
};

export type CollectionInfo = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isBuiltin: boolean;
  count: number;
  cover: Pick<WallpaperInfo, "basePath" | "lqip"> | null;
  /** Custom collections only: masked source link + last sync outcome. */
  sourceMask: string | null;
  lastSyncedAt: Date | null;
  lastError: string | null;
};

const wallpaperSelect = {
  id: true,
  basePath: true,
  width: true,
  height: true,
  meanLuminance: true,
  suggestedScrimOpacity: true,
  dominantColors: true,
  lqip: true,
  attribution: true,
} as const;

function toInfo(w: {
  id: string;
  basePath: string;
  width: number;
  height: number;
  meanLuminance: number;
  suggestedScrimOpacity: number;
  dominantColors: unknown;
  lqip: string;
  attribution: unknown;
}): WallpaperInfo {
  const a = (w.attribution && typeof w.attribution === "object" ? w.attribution : {}) as Record<string, unknown>;
  return {
    id: w.id,
    basePath: w.basePath,
    width: w.width,
    height: w.height,
    meanLuminance: w.meanLuminance,
    suggestedScrimOpacity: w.suggestedScrimOpacity,
    dominantColors: Array.isArray(w.dominantColors) ? (w.dominantColors as string[]) : [],
    lqip: w.lqip,
    attribution: {
      photographer: String(a["photographer"] ?? ""),
      source: String(a["source"] ?? ""),
      license: String(a["license"] ?? ""),
      sourceUrl: String(a["sourceUrl"] ?? ""),
    },
  };
}

/** Collections this user may pick from: every built-in plus their own. */
export async function listCollections(userId: string): Promise<CollectionInfo[]> {
  const rows = await prisma.wallpaperCollection.findMany({
    where: { OR: [{ isBuiltin: true }, { ownerId: userId }] },
    orderBy: [{ isBuiltin: "desc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      isBuiltin: true,
      sourceMask: true,
      lastSyncedAt: true,
      lastError: true,
      _count: { select: { wallpapers: true } },
      wallpapers: { orderBy: { sortOrder: "asc" }, take: 1, select: { basePath: true, lqip: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    isBuiltin: r.isBuiltin,
    count: r._count.wallpapers,
    cover: r.wallpapers[0] ?? null,
    sourceMask: r.sourceMask,
    lastSyncedAt: r.lastSyncedAt,
    lastError: r.lastError,
  }));
}

/** True if this user may use the collection (built-in or their own). */
export async function canUseCollection(userId: string, collectionId: string): Promise<boolean> {
  const c = await prisma.wallpaperCollection.findFirst({
    where: { id: collectionId, OR: [{ isBuiltin: true }, { ownerId: userId }] },
    select: { id: true },
  });
  return c !== null;
}

/** All wallpapers in a collection the user may see, with the board's per-board skip/pin state applied. */
export async function listWallpapers(userId: string, collectionId: string): Promise<WallpaperInfo[]> {
  if (!(await canUseCollection(userId, collectionId))) return [];
  const rows = await prisma.wallpaper.findMany({ where: { collectionId }, orderBy: { sortOrder: "asc" }, select: wallpaperSelect });
  return rows.map(toInfo);
}

/**
 * The wallpaper a board should render right now. Falls back to the first
 * non-skipped image in the collection when no pointer is set yet (a freshly
 * assigned collection before the worker's first tick).
 */
export async function currentWallpaper(board: BoardFull): Promise<WallpaperInfo | null> {
  if (!board.wallpaperCollectionId) return null;
  const skipped = board.style.wallpaperSkipped ?? [];
  if (board.currentWallpaperId && !skipped.includes(board.currentWallpaperId)) {
    const w = await prisma.wallpaper.findFirst({
      where: { id: board.currentWallpaperId, collectionId: board.wallpaperCollectionId },
      select: wallpaperSelect,
    });
    if (w) return toInfo(w);
  }
  const first = await prisma.wallpaper.findFirst({
    where: { collectionId: board.wallpaperCollectionId, id: { notIn: skipped } },
    orderBy: { sortOrder: "asc" },
    select: wallpaperSelect,
  });
  return first ? toInfo(first) : null;
}

/** Pin/unpin the current wallpaper for this board (per-board — built-ins are shared). */
export async function togglePin(userId: string, board: BoardFull): Promise<boolean> {
  const pinned = board.style.wallpaperPinned === board.currentWallpaperId ? null : board.currentWallpaperId;
  return patchBoardStyle(userId, board.id, { wallpaperPinned: pinned });
}

/** Exclude the current wallpaper from this board's cycle. The caller advances afterwards. */
export async function skipCurrent(userId: string, board: BoardFull): Promise<boolean> {
  if (!board.currentWallpaperId) return false;
  const skipped = new Set(board.style.wallpaperSkipped ?? []);
  skipped.add(board.currentWallpaperId);
  return patchBoardStyle(userId, board.id, { wallpaperSkipped: [...skipped], wallpaperPinned: null });
}

/** Asks the worker to advance now (internal service call, §4.2-compliant). */
export async function requestAdvance(boardId: string): Promise<boolean> {
  const base = process.env.WORKER_URL ?? "http://worker:3002";
  try {
    const res = await fetch(`${base}/jobs/wallpaper-advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ boardId }),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
