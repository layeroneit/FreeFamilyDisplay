import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@ffd/db";
import type { BoardFull } from "@/lib/board/boards";
import { safeWidgetConfig } from "@/lib/board/widgets";
import { weatherKey, type WeatherPayload } from "@/lib/board/weather-codes";
import type { BoardData } from "./widget-view";

function samplePhotoSrcs(): string[] {
  try {
    const dir = path.join(process.cwd(), "public", "login-photos");
    const credits = JSON.parse(readFileSync(path.join(dir, "credits.json"), "utf8")) as Array<{ file: string }>;
    return credits.filter((c) => existsSync(path.join(dir, c.file))).map((c) => `/login-photos/${c.file}`);
  } catch {
    return [];
  }
}

/** Everything the renderer needs, resolved from Postgres only (plan §4.2). */
export async function loadBoardData(board: BoardFull, viewerName: string): Promise<BoardData> {
  const keys = [
    ...new Set(
      board.widgets
        .filter((w) => w.type === "weather")
        .map((w) => weatherKey(safeWidgetConfig("weather", w.config).location)),
    ),
  ];
  const rows = keys.length
    ? await prisma.cachedPayload.findMany({
        where: { kind: "weather", key: { in: keys } },
        select: { key: true, payload: true },
      })
    : [];
  const weather: Record<string, WeatherPayload | undefined> = {};
  for (const r of rows) {
    const p = r.payload as Partial<WeatherPayload>;
    // A row that only ever recorded an error has an empty payload — treat as missing.
    if (p && p.current && p.daily) weather[r.key] = p as WeatherPayload;
  }

  return { viewerName, photoSrcs: samplePhotoSrcs(), weather, now: new Date() };
}
