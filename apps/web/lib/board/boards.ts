/**
 * Board persistence — every function takes the acting userId and scopes by it
 * (CLAUDE.md: tenancy scoping lives at the repository layer).
 */

import "server-only";
import { prisma } from "@ffd/db";
import {
  isWidgetType,
  normalizeGeometry,
  parseWidgetConfig,
  STARTER_LAYOUT,
  WIDGET_META,
  type WidgetGeometry,
  type WidgetType,
} from "./widgets";
import { pokeWorkerWeather } from "./worker-poke";

/** Family scale; also the rail against one account fanning out weather fetches. */
export const MAX_BOARDS_PER_USER = 20;

export class BoardLimitError extends Error {
  constructor() {
    super(`You've reached the limit of ${MAX_BOARDS_PER_USER} displays. Delete one to add another.`);
    this.name = "BoardLimitError";
  }
}

export type BoardSummary = { id: string; name: string; theme: string; updatedAt: Date; widgetCount: number };

export type BoardWidgetRow = {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  config: unknown;
};

export type BoardFull = { id: string; name: string; theme: string; widgets: BoardWidgetRow[] };

export async function listBoards(userId: string): Promise<BoardSummary[]> {
  const rows = await prisma.board.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, theme: true, updatedAt: true, _count: { select: { widgets: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    theme: r.theme,
    updatedAt: r.updatedAt,
    widgetCount: r._count.widgets,
  }));
}

export async function getBoard(userId: string, boardId: string): Promise<BoardFull | null> {
  const b = await prisma.board.findFirst({
    where: { id: boardId, userId },
    select: {
      id: true,
      name: true,
      theme: true,
      widgets: {
        orderBy: [{ z: "asc" }, { createdAt: "asc" }],
        select: { id: true, type: true, x: true, y: true, w: true, h: true, z: true, config: true },
      },
    },
  });
  if (!b) return null;
  const widgets: BoardWidgetRow[] = [];
  for (const w of b.widgets) {
    // Unknown types (a future removal) are dropped rather than crashing render.
    if (isWidgetType(w.type)) widgets.push({ ...w, type: w.type });
  }
  return { id: b.id, name: b.name, theme: b.theme, widgets };
}

export async function createBoard(
  userId: string,
  input: { name: string; theme: string; widgets: WidgetType[]; configs?: Partial<Record<WidgetType, unknown>> },
): Promise<string> {
  const existing = await prisma.board.count({ where: { userId } });
  if (existing >= MAX_BOARDS_PER_USER) throw new BoardLimitError();
  const rows = input.widgets.map((type, i) => {
    const g = STARTER_LAYOUT[type];
    return { type, ...g, z: i, config: parseWidgetConfig(type, input.configs?.[type]) as object };
  });
  const board = await prisma.board.create({
    data: { userId, name: input.name, theme: input.theme, widgets: { create: rows } },
    select: { id: true },
  });
  if (input.widgets.includes("weather")) pokeWorkerWeather();
  return board.id;
}

export async function updateBoard(
  userId: string,
  boardId: string,
  patch: { name?: string; theme?: string },
): Promise<boolean> {
  const r = await prisma.board.updateMany({ where: { id: boardId, userId }, data: patch });
  return r.count > 0;
}

export async function deleteBoard(userId: string, boardId: string): Promise<boolean> {
  const r = await prisma.board.deleteMany({ where: { id: boardId, userId } });
  return r.count > 0;
}

export async function addWidget(
  userId: string,
  boardId: string,
  type: WidgetType,
  rawConfig: unknown,
): Promise<BoardWidgetRow | null> {
  const owned = await prisma.board.findFirst({ where: { id: boardId, userId }, select: { id: true } });
  if (!owned) return null;
  const size = WIDGET_META[type].defaultSize;
  const count = await prisma.boardWidget.count({ where: { boardId } });
  // Cascade new widgets down the canvas so they do not stack invisibly.
  const g = normalizeGeometry(type, { x: 40 + (count % 5) * 40, y: 40 + (count % 5) * 40, ...size, z: count });
  const row = await prisma.boardWidget.create({
    data: { boardId, type, ...g, config: parseWidgetConfig(type, rawConfig) as object },
    select: { id: true, type: true, x: true, y: true, w: true, h: true, z: true, config: true },
  });
  await prisma.board.update({ where: { id: boardId }, data: { updatedAt: new Date() } });
  if (type === "weather") pokeWorkerWeather();
  return { ...row, type };
}

export async function updateWidget(
  userId: string,
  boardId: string,
  widgetId: string,
  patch: { geometry?: WidgetGeometry; config?: unknown },
): Promise<boolean> {
  const w = await prisma.boardWidget.findFirst({
    where: { id: widgetId, boardId, board: { userId } },
    select: { type: true },
  });
  if (!w || !isWidgetType(w.type)) return false;
  const data: { x?: number; y?: number; w?: number; h?: number; z?: number; config?: object } = {};
  if (patch.geometry) Object.assign(data, normalizeGeometry(w.type, patch.geometry));
  if (patch.config !== undefined) data.config = parseWidgetConfig(w.type, patch.config) as object;
  await prisma.boardWidget.update({ where: { id: widgetId }, data });
  await prisma.board.update({ where: { id: boardId }, data: { updatedAt: new Date() } });
  if (w.type === "weather" && patch.config !== undefined) pokeWorkerWeather();
  return true;
}

export async function removeWidget(userId: string, boardId: string, widgetId: string): Promise<boolean> {
  const r = await prisma.boardWidget.deleteMany({ where: { id: widgetId, boardId, board: { userId } } });
  return r.count > 0;
}
