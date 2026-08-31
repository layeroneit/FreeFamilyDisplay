/**
 * Board persistence — every function takes the acting userId and scopes by it
 * (CLAUDE.md: tenancy scoping lives at the repository layer).
 */

import "server-only";
import { prisma } from "@ffd/db";
import type { CanvasPreset as DbCanvasPreset, WallpaperOrder, WallpaperRotation } from "@ffd/db";
import {
  isWidgetType,
  normalizeGeometry,
  parseWidgetConfig,
  STARTER_LAYOUTS,
  WIDGET_META,
  type CanvasPreset,
  type WidgetGeometry,
  type WidgetType,
} from "./widgets";
import { pokeWorkerConnectors, pokeWorkerWeather } from "./worker-poke";
import { sealLinkFields } from "./secrets";

/** Family scale; also the rail against one account fanning out weather fetches. */
export const MAX_BOARDS_PER_USER = 20;

export class BoardLimitError extends Error {
  constructor() {
    super(`You've reached the limit of ${MAX_BOARDS_PER_USER} displays. Delete one to add another.`);
    this.name = "BoardLimitError";
  }
}

export type BoardSummary = { id: string; name: string; theme: string; canvas: CanvasPreset; updatedAt: Date; widgetCount: number };

export type BoardWidgetRow = {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  /** Full config INCLUDING secrets — server-side only. Use publicWidgetConfig before sending. */
  config: unknown;
};

export type BoardStyle = {
  wallpaperShown?: string[];
  wallpaperSkipped?: string[];
  wallpaperPinned?: string | null;
  /**
   * Seasonal edge decor and the hourly birthday celebration. Both live in the
   * style JSON rather than in their own columns: they are display preferences,
   * not relational data, and this ships them without a migration. Absent means
   * on — the features are why they were built, and a board that has never been
   * touched should show them.
   */
  seasonalDecor?: boolean;
  birthdayCheer?: boolean;
};

export type BoardFull = {
  id: string;
  name: string;
  theme: string;
  canvas: CanvasPreset;
  widgets: BoardWidgetRow[];
  wallpaperCollectionId: string | null;
  wallpaperRotation: WallpaperRotation;
  cycleCollections: boolean;
  wallpaperOrder: WallpaperOrder;
  currentWallpaperId: string | null;
  scrimOpacityOverride: number | null;
  matchPaletteToWallpaper: boolean;
  weatherMood: boolean;
  weatherMoodStrength: number;
  /// Presence of a wall-screen link. The token itself is never selected.
  displayTokenHash: string | null;
  displaySeenAt: Date | null;
  style: BoardStyle;
};

const boardSelect = {
  id: true,
  name: true,
  theme: true,
  canvas: true,
  wallpaperCollectionId: true,
  wallpaperRotation: true,
  cycleCollections: true,
  wallpaperOrder: true,
  currentWallpaperId: true,
  scrimOpacityOverride: true,
  matchPaletteToWallpaper: true,
  weatherMood: true,
  weatherMoodStrength: true,
  displayTokenHash: true,
  displaySeenAt: true,
  style: true,
  widgets: {
    orderBy: [{ z: "asc" as const }, { createdAt: "asc" as const }],
    select: { id: true, type: true, x: true, y: true, w: true, h: true, z: true, config: true },
  },
};

function readStyle(raw: unknown): BoardStyle {
  if (!raw || typeof raw !== "object") return {};
  const s = raw as Record<string, unknown>;
  return {
    wallpaperShown: Array.isArray(s["wallpaperShown"]) ? (s["wallpaperShown"] as string[]) : [],
    wallpaperSkipped: Array.isArray(s["wallpaperSkipped"]) ? (s["wallpaperSkipped"] as string[]) : [],
    wallpaperPinned: typeof s["wallpaperPinned"] === "string" ? (s["wallpaperPinned"] as string) : null,
    seasonalDecor: s["seasonalDecor"] !== false,
    birthdayCheer: s["birthdayCheer"] !== false,
  };
}

export async function listBoards(userId: string): Promise<BoardSummary[]> {
  const rows = await prisma.board.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, theme: true, canvas: true, updatedAt: true, _count: { select: { widgets: true } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, theme: r.theme, canvas: r.canvas, updatedAt: r.updatedAt, widgetCount: r._count.widgets }));
}

export async function getBoard(userId: string, boardId: string): Promise<BoardFull | null> {
  const b = await prisma.board.findFirst({ where: { id: boardId, userId }, select: boardSelect });
  if (!b) return null;
  const widgets: BoardWidgetRow[] = [];
  for (const w of b.widgets) {
    // Unknown types (a future removal) are dropped rather than crashing render.
    if (isWidgetType(w.type)) widgets.push({ ...w, type: w.type });
  }
  return { ...b, widgets, style: readStyle(b.style) };
}

export async function createBoard(
  userId: string,
  input: { name: string; theme: string; canvas?: CanvasPreset; widgets: WidgetType[]; configs?: Partial<Record<WidgetType, unknown>> },
): Promise<string> {
  const existing = await prisma.board.count({ where: { userId } });
  if (existing >= MAX_BOARDS_PER_USER) throw new BoardLimitError();
  const canvas: CanvasPreset = input.canvas ?? "LANDSCAPE";
  const layout = STARTER_LAYOUTS[canvas];
  const rows = input.widgets.map((type, i) => {
    const g = layout[type];
    return { type, ...g, z: i, config: parseWidgetConfig(type, input.configs?.[type]) as object };
  });
  const board = await prisma.board.create({
    data: { userId, name: input.name, theme: input.theme, canvas: canvas as DbCanvasPreset, widgets: { create: rows } },
    select: { id: true },
  });
  if (input.widgets.includes("weather")) pokeWorkerWeather();
  return board.id;
}

export type BoardPatch = {
  name?: string;
  theme?: string;
  canvas?: CanvasPreset;
  wallpaperCollectionId?: string | null;
  wallpaperRotation?: WallpaperRotation;
  cycleCollections?: boolean;
  wallpaperOrder?: WallpaperOrder;
  scrimOpacityOverride?: number | null;
  matchPaletteToWallpaper?: boolean;
  weatherMood?: boolean;
  weatherMoodStrength?: number;
};

export async function updateBoard(userId: string, boardId: string, patch: BoardPatch): Promise<boolean> {
  const data: Record<string, unknown> = { ...patch };
  if (patch.canvas) data["canvas"] = patch.canvas as DbCanvasPreset;
  const r = await prisma.board.updateMany({ where: { id: boardId, userId }, data });
  return r.count > 0;
}

export async function deleteBoard(userId: string, boardId: string): Promise<boolean> {
  const r = await prisma.board.deleteMany({ where: { id: boardId, userId } });
  return r.count > 0;
}

export async function addWidget(userId: string, boardId: string, type: WidgetType, rawConfig: unknown): Promise<BoardWidgetRow | null> {
  const owned = await prisma.board.findFirst({ where: { id: boardId, userId }, select: { id: true, canvas: true } });
  if (!owned) return null;
  const size = WIDGET_META[type].defaultSize;
  const count = await prisma.boardWidget.count({ where: { boardId } });
  // Cascade new widgets down the canvas so they do not stack invisibly.
  const g = normalizeGeometry(type, { x: 40 + (count % 5) * 40, y: 40 + (count % 5) * 40, ...size, z: count }, owned.canvas);
  const row = await prisma.boardWidget.create({
    data: { boardId, type, ...g, config: parseWidgetConfig(type, rawConfig) as object },
    select: { id: true, type: true, x: true, y: true, w: true, h: true, z: true, config: true },
  });
  await prisma.board.update({ where: { id: boardId }, data: { updatedAt: new Date() } });
  if (type === "weather") pokeWorkerWeather();
  return { ...row, type };
}

/**
 * Updates geometry and/or config. `config` is merged over the stored config so
 * a client that never sees the encrypted secret fields cannot accidentally
 * erase them; a caller that wants to replace a secret passes it explicitly.
 */
export async function updateWidget(
  userId: string,
  boardId: string,
  widgetId: string,
  patch: { geometry?: WidgetGeometry; config?: unknown },
): Promise<boolean> {
  const w = await prisma.boardWidget.findFirst({
    where: { id: widgetId, boardId, board: { userId } },
    select: { type: true, config: true, board: { select: { canvas: true } } },
  });
  if (!w || !isWidgetType(w.type)) return false;
  const data: { x?: number; y?: number; w?: number; h?: number; z?: number; config?: object } = {};
  if (patch.geometry) Object.assign(data, normalizeGeometry(w.type, patch.geometry, w.board.canvas));
  if (patch.config !== undefined) {
    const stored = (w.config && typeof w.config === "object" ? w.config : {}) as Record<string, unknown>;
    const incoming = (patch.config && typeof patch.config === "object" ? patch.config : {}) as Record<string, unknown>;
    // Plaintext links never reach the row: sealed (encrypted + masked) here.
    const sealed = sealLinkFields(widgetId, w.type, incoming);
    const merged: Record<string, unknown> = { ...stored, ...sealed };
    for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
    data.config = parseWidgetConfig(w.type, merged) as object;
  }
  await prisma.boardWidget.update({ where: { id: widgetId }, data });
  await prisma.board.update({ where: { id: boardId }, data: { updatedAt: new Date() } });
  if (w.type === "weather" && patch.config !== undefined) pokeWorkerWeather();
  if ((w.type === "calendar" || w.type === "photos") && patch.config !== undefined) pokeWorkerConnectors();
  return true;
}

export async function removeWidget(userId: string, boardId: string, widgetId: string): Promise<boolean> {
  const r = await prisma.boardWidget.deleteMany({ where: { id: widgetId, boardId, board: { userId } } });
  return r.count > 0;
}

/** Merges keys into the board's style JSON (owner only). */
export async function patchBoardStyle(userId: string, boardId: string, patch: Partial<BoardStyle>): Promise<boolean> {
  const b = await prisma.board.findFirst({ where: { id: boardId, userId }, select: { style: true } });
  if (!b) return false;
  const current = (b.style && typeof b.style === "object" ? b.style : {}) as Record<string, unknown>;
  await prisma.board.update({ where: { id: boardId }, data: { style: { ...current, ...patch } } });
  return true;
}
