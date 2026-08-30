import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@ffd/db";
import type { BoardFull } from "@/lib/board/boards";
import { safeWidgetConfig } from "@/lib/board/widgets";
import { WeatherPayloadSchema, weatherKey, type WeatherPayload } from "@/lib/board/weather-codes";
import type { BoardData } from "./widget-view";

// The sample set is baked into the image at build time; read it once per
// process rather than doing blocking file I/O on every board render.
let samplePhotoCache: string[] | null = null;

function samplePhotoSrcs(): string[] {
  if (samplePhotoCache) return samplePhotoCache;
  try {
    const dir = path.join(process.cwd(), "public", "login-photos");
    const credits = JSON.parse(readFileSync(path.join(dir, "credits.json"), "utf8")) as Array<{ file: string }>;
    samplePhotoCache = credits.filter((c) => existsSync(path.join(dir, c.file))).map((c) => `/login-photos/${c.file}`);
  } catch {
    samplePhotoCache = [];
  }
  return samplePhotoCache;
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
    // An error-only row has an empty payload; a future upstream shape change
    // fails validation. Both render as "fetching…" rather than a 500.
    const parsed = WeatherPayloadSchema.safeParse(r.payload);
    if (parsed.success) weather[r.key] = parsed.data;
  }

  return { viewerName, photoSrcs: samplePhotoSrcs(), weather, now: new Date() };
}
