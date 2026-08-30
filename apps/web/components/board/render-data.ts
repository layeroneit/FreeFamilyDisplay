import "server-only";
import { prisma } from "@ffd/db";
import type { BoardFull } from "@/lib/board/boards";
import { moodFor, type Mood } from "@/lib/board/mood";
import { largestSrc, loginPhotoSet } from "@/lib/board/photo-set";
import { safeWidgetConfig } from "@/lib/board/widgets";
import { WeatherPayloadSchema, weatherKey, type WeatherPayload } from "@/lib/board/weather-codes";
import { currentWallpaper, type WallpaperInfo } from "@/lib/board/wallpapers";
import type { BoardData, CalendarFeed } from "./widget-view";

export type BoardScene = {
  data: BoardData;
  wallpaper: WallpaperInfo | null;
  scrimOpacity: number;
  mood: Mood | null;
  /** Token overrides layered over the theme: wallpaper text color, palette linking. */
  varOverrides: Record<string, string>;
};

/** Everything the renderer needs, resolved from Postgres only (plan §4.2). */
export async function loadBoardData(board: BoardFull, viewerName: string): Promise<BoardData> {
  const weatherKeys = [
    ...new Set(board.widgets.filter((w) => w.type === "weather").map((w) => weatherKey(safeWidgetConfig("weather", w.config).location))),
  ];
  const calendarIds = board.widgets.filter((w) => w.type === "calendar").map((w) => w.id);
  const photoIds = board.widgets.filter((w) => w.type === "photos" && safeWidgetConfig("photos", w.config).source === "link").map((w) => w.id);

  const rows = await prisma.cachedPayload.findMany({
    where: {
      OR: [
        ...(weatherKeys.length ? [{ kind: "weather", key: { in: weatherKeys } }] : []),
        ...(calendarIds.length ? [{ kind: "ics", key: { in: calendarIds } }] : []),
        ...(photoIds.length ? [{ kind: "photos", key: { in: photoIds } }] : []),
      ],
    },
    select: { kind: true, key: true, payload: true, fetchedAt: true, lastError: true },
  });

  const weather: Record<string, WeatherPayload | undefined> = {};
  const calendars: Record<string, CalendarFeed> = {};
  const linkPhotos: Record<string, { srcs: string[]; error: string | null }> = {};
  for (const r of rows) {
    if (r.kind === "weather") {
      const parsed = WeatherPayloadSchema.safeParse(r.payload);
      if (parsed.success) weather[r.key] = parsed.data;
    } else if (r.kind === "ics") {
      const p = r.payload as { events?: unknown };
      const events = Array.isArray(p?.events) ? (p.events as CalendarFeed["events"]) : [];
      calendars[r.key] = { events, syncedAt: r.fetchedAt.getTime() > 0 ? r.fetchedAt : null, error: r.lastError };
    } else if (r.kind === "photos") {
      const p = r.payload as { files?: unknown };
      const files = Array.isArray(p?.files) ? (p.files as string[]) : [];
      linkPhotos[r.key] = { srcs: files.map((f) => `/media/photos/${r.key}/${f}`), error: r.lastError };
    }
  }
  // A link that has been saved but not yet synced: show the pending state, not the samples.
  for (const id of photoIds) linkPhotos[id] ??= { srcs: [], error: null };
  for (const id of calendarIds) {
    const w = board.widgets.find((x) => x.id === id)!;
    if (safeWidgetConfig("calendar", w.config).icsSecret) calendars[id] ??= { events: [], syncedAt: null, error: null };
  }

  return { viewerName, photoSrcs: loginPhotoSet().map(largestSrc), weather, calendars, linkPhotos, now: new Date() };
}

/** Data + backdrop + token overrides — the full scene for one board. */
export async function loadBoardScene(board: BoardFull, viewerName: string): Promise<BoardScene> {
  const [data, wallpaper] = await Promise.all([loadBoardData(board, viewerName), currentWallpaper(board)]);

  let mood: Mood | null = null;
  if (board.weatherMood) {
    const first = board.widgets.find((w) => w.type === "weather");
    const w = first ? data.weather[weatherKey(safeWidgetConfig("weather", first.config).location)] : undefined;
    if (w) mood = moodFor(w.current.code, w.current.isDay, board.weatherMoodStrength);
  }

  const scrimOpacity = wallpaper ? (board.scrimOpacityOverride ?? wallpaper.suggestedScrimOpacity) : 0;

  const varOverrides: Record<string, string> = {};
  if (wallpaper) {
    const dark = wallpaper.meanLuminance > 0.5 && scrimOpacity < 0.35;
    varOverrides["--hearth-text"] = dark ? "#171717" : "#F5F2EA";
    varOverrides["--hearth-text-muted"] = dark ? "#4a4a4a" : "#D6D2C8";
    if (board.matchPaletteToWallpaper && wallpaper.dominantColors.length >= 4) {
      wallpaper.dominantColors.slice(0, 4).forEach((c, i) => (varOverrides[`--hearth-accent-${i + 1}`] = c));
    }
  }

  return { data, wallpaper, scrimOpacity, mood, varOverrides };
}
