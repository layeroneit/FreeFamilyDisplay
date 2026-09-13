import "server-only";
import { prisma } from "@ffd/db";
import type { BoardFull } from "@/lib/board/boards";
import { moodFor, type Mood } from "@/lib/board/mood";
import { birthdaysOn } from "@/lib/board/birthdays";
import { largestSrc, loginPhotoSet } from "@/lib/board/photo-set";
import { safeWidgetConfig } from "@/lib/board/widgets";
import { WeatherPayloadSchema, weatherKey, type WeatherPayload } from "@/lib/board/weather-codes";
import { currentWallpaper, type WallpaperInfo } from "@/lib/board/wallpapers";
import { NFL_CACHE_KEY, NFL_CACHE_KIND, gameDayFor, gameDayVars, hypeLines, parseNflPayload, type HypeLine } from "@/lib/board/nfl";
import { createLogger } from "@ffd/log";
import { collectionFontVars, hasCollectionFonts } from "@/lib/board/collection-fonts";
import type { BoardData, CalendarFeed } from "./widget-view";

const log = createLogger("web.render-data");

/** The collection's slug, which selects its lettering. Null for no collection. */
async function collectionMeta(
  collectionId: string | null,
): Promise<{ slug: string | null; rightsNote: string | null; sourceTags: string | null }> {
  if (!collectionId) return { slug: null, rightsNote: null, sourceTags: null };
  const c = await prisma.wallpaperCollection.findUnique({ where: { id: collectionId }, select: { slug: true, rightsNote: true, sourceTags: true } });
  return { slug: c?.slug ?? null, rightsNote: c?.rightsNote ?? null, sourceTags: c?.sourceTags ?? null };
}

export type BoardScene = {
  data: BoardData;
  wallpaper: WallpaperInfo | null;
  scrimOpacity: number;
  mood: Mood | null;
  /** Token overrides layered over the theme: wallpaper text color, palette linking. */
  varOverrides: Record<string, string>;
  /** Owner-written note on the wallpaper collection, shown with the credit. */
  rightsNote: string | null;
  /** Names the calendar says have a birthday today. Empty when the board has
   *  the celebration switched off, or when nobody does. */
  birthdays: string[];
  /** Non-null exactly when the household's team plays today and game-day hype
   *  is on: the takeover, the sky, and the celebrations all key off this.
   *  Plain serializable values — the celebration is a client component. */
  gameDay: {
    teamAbbr: string;
    nickname: string;
    emoji: string;
    bg: string;
    accent: string;
    accent2: string;
    kickoffIso: string;
    lines: HypeLine[];
  } | null;
};

/** Everything the renderer needs, resolved from Postgres only (plan §4.2). */
export async function loadBoardData(board: BoardFull, viewerName: string): Promise<BoardData> {
  const weatherKeys = [
    ...new Set(board.widgets.filter((w) => w.type === "weather").map((w) => weatherKey(safeWidgetConfig("weather", w.config).location))),
  ];
  const calendarIds = board.widgets.filter((w) => w.type === "calendar").map((w) => w.id);
  const photoIds = board.widgets.filter((w) => w.type === "photos" && safeWidgetConfig("photos", w.config).source === "link").map((w) => w.id);
  const wantsNfl = Boolean(board.style.nflTeam) || board.widgets.some((w) => w.type === "scores");

  const rows = await prisma.cachedPayload.findMany({
    where: {
      OR: [
        ...(weatherKeys.length ? [{ kind: "weather", key: { in: weatherKeys } }] : []),
        ...(calendarIds.length ? [{ kind: "ics", key: { in: calendarIds } }] : []),
        ...(photoIds.length ? [{ kind: "photos", key: { in: photoIds } }] : []),
        ...(wantsNfl ? [{ kind: NFL_CACHE_KIND, key: NFL_CACHE_KEY }] : []),
      ],
    },
    select: { kind: true, key: true, payload: true, fetchedAt: true, lastError: true },
  });

  const weather: Record<string, WeatherPayload | undefined> = {};
  const calendars: Record<string, CalendarFeed> = {};
  const linkPhotos: Record<string, { srcs: string[]; error: string | null }> = {};
  let nfl: BoardData["nfl"] = wantsNfl ? { games: [], syncedAt: null, error: null } : null;
  for (const r of rows) {
    if (r.kind === NFL_CACHE_KIND) {
      // fetchedAt at epoch 0 is the worker's "never succeeded" placeholder
      // (payload {}): not a parse failure, and not worth a warning per render.
      const never = r.fetchedAt.getTime() <= 0;
      // Salvaging parse: a single malformed game must not zero the slate (and
      // silently un-theme game day). Dropping is logged — the worker accepted
      // what we rejected, and that asymmetry is worth seeing in the logs.
      const parsed = never ? null : parseNflPayload(r.payload);
      const rejected = !never && (!parsed || (parsed.dropped > 0 && parsed.games.length === 0));
      if (!never && (!parsed || parsed.dropped > 0)) {
        log.warn("nfl payload rejected on read-back", { dropped: parsed ? parsed.dropped : "all", nothingSurvived: rejected });
      }
      nfl = {
        games: parsed?.games ?? [],
        syncedAt: never ? null : r.fetchedAt,
        // A payload this side rejected wholesale must read as a fault on the
        // widget, never as "warming up" — surface it as an error.
        error: r.lastError ?? (rejected ? "scoreboard format not recognized" : null),
      };
    } else if (r.kind === "weather") {
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

  return {
    viewerName,
    photoSrcs: loginPhotoSet().map(largestSrc),
    weather,
    calendars,
    linkPhotos,
    now: new Date(),
    seasonalDecor: board.style.seasonalDecor !== false,
    nfl,
    nflTeam: board.style.nflTeam ?? null,
  };
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

  // Every calendar widget on the board feeds one list — a household often
  // keeps birthdays on a contacts calendar separate from the family one.
  // !== false, matching every other reader of these flags: absent means on.
  const birthdays = board.style.birthdayCheer !== false
    ? birthdaysOn(
        Object.values(data.calendars).flatMap((c) => c?.events ?? []),
        data.now,
      )
    : [];

  const scrimOpacity = wallpaper ? (board.scrimOpacityOverride ?? wallpaper.suggestedScrimOpacity) : 0;

  const varOverrides: Record<string, string> = {};
  let rightsNote: string | null = null;
  if (wallpaper) {
    const dark = wallpaper.meanLuminance > 0.5 && scrimOpacity < 0.35;
    varOverrides["--hearth-text"] = dark ? "#171717" : "#F5F2EA";
    varOverrides["--hearth-text-muted"] = dark ? "#4a4a4a" : "#D6D2C8";
    if (board.matchPaletteToWallpaper && wallpaper.dominantColors.length >= 4) {
      wallpaper.dominantColors.slice(0, 4).forEach((c, i) => (varOverrides[`--hearth-accent-${i + 1}`] = c));
    }
    // The collection carries its own lettering (operator, 2026-08-30: an anime
    // collection should look like one, not just swap the photo).
    const meta = await collectionMeta(board.wallpaperCollectionId);
    rightsNote = meta.rightsNote;
    // A built-in theme is named in the font table and keeps its own lettering.
    // A collection somebody made themselves has a slug generated per user, so
    // it can never match one -- if it is tag-fed it is anime art by
    // construction, so ask for the anime lettering by name.
    const fontKey = hasCollectionFonts(meta.slug) ? meta.slug : meta.sourceTags ? "anime" : meta.slug;
    Object.assign(varOverrides, collectionFontVars(fontKey));
  }

  // Game day: the household's team plays today, so the board wears its colors.
  // Layered LAST — over the wallpaper's text/palette picks — because on game
  // day the takeover IS the look; the wallpaper keeps only its photo.
  let gameDay: BoardScene["gameDay"] = null;
  if (board.style.gameDayHype !== false) {
    const gd = gameDayFor(data.nfl?.games ?? [], board.style.nflTeam ?? null, data.now);
    if (gd) {
      const teamVars = gameDayVars(gd.team);
      if (wallpaper) {
        // A wallpaper covers --hearth-bg entirely, and the wallpaper branch
        // above already chose text ink FOR THE PHOTO (dark over a bright
        // image). Swapping surfaces to team navy under that ink — through the
        // 72%-translucent card treatment — breaks both choices at once. Over
        // a photo the takeover therefore contributes ACCENTS only; the sky,
        // badge and celebrations still make game day unmistakable.
        for (const k of Object.keys(teamVars)) {
          if (!k.startsWith("--hearth-accent-")) delete teamVars[k];
        }
      }
      Object.assign(varOverrides, teamVars);
      gameDay = {
        teamAbbr: gd.team.abbr,
        nickname: gd.team.nickname,
        emoji: gd.team.emoji,
        bg: gd.team.bg,
        accent: gd.team.accent,
        accent2: gd.team.accent2,
        kickoffIso: gd.game.date,
        lines: hypeLines(gd.team),
      };
    }
  }

  return { data, wallpaper, scrimOpacity, mood, varOverrides, rightsNote, birthdays, gameDay };
}
