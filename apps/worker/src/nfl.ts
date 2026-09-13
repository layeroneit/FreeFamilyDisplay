/**
 * NFL scoreboard job — ESPN's public scoreboard, no key, no account. Runs on
 * a schedule in `worker` and writes ONE normalized row to CachedPayload
 * (kind "nfl", key "scoreboard"); the render path only ever reads Postgres
 * (plan §4.2). One fetch serves every board in the house.
 *
 * The host is fixed (not user-supplied), so this sits outside the §8.3 SSRF
 * guard's scope — nothing user-controlled travels in the URL at all. What
 * comes back is validated with zod before it touches a database row.
 *
 * Cadence: the tick is cheap and frequent; the FETCH is what's rationed.
 * - nobody has picked a team and no scores widget exists → never fetch
 * - a game is live, or within the hour before a kickoff → every tick (3 min)
 * - otherwise → hourly, which keeps "do they play today" a day fresh
 * The endpoint is unofficial: on failure the stale payload stays (stale-but-
 * labeled beats blank, plan §3) and the error is recorded beside it.
 */

import { z } from "zod";
import { prisma } from "@ffd/db";
import { createLogger } from "@ffd/log";

const log = createLogger("worker.nfl");

/**
 * 30s tick / 25s live threshold: live scores refresh every ~30 seconds,
 * which is the cadence ESPN's own site polls its scoreboard at — "as fast
 * as ESPN allows" without being a bad citizen from a family kitchen
 * (operator, 2026-09-13: 2-3 minutes read as "taking too long" during the
 * Bears game). The fast rate applies ONLY while a game is actually in
 * play; the hour-long pre-kickoff lead, where every score is a guaranteed
 * zero and only a flex/time change can be observed, stays at 3 minutes —
 * this repo is public, and a thousand installs polling an unofficial
 * keyless endpoint through a dead hour is how it gets rate-limited for
 * everyone. The tick's own DB reads are tiny table scans at family scale,
 * and anyoneWatching memoizes for a minute besides; dueForFetch rations
 * the actual HTTP so idle days stay at ~1 request/hour.
 */
export const NFL_TICK_MS = 30 * 1000;
const LIVE_REFETCH_MS = 25 * 1000;
const PRE_LEAD_REFETCH_MS = 3 * 60 * 1000;
const IDLE_REFETCH_MS = 55 * 60 * 1000;
/**
 * The active window opens a full hour before kickoff (operator, 2026-09-13):
 * flexed games, moved kickoff times and delays need to land BEFORE the
 * family is looking at the widget, and an hourly cadence could miss a change
 * made minutes earlier. Signed (not a window around kickoff): a game whose
 * kickoff has passed while the feed still says "pre" is a delay, and a delay
 * is exactly when the household wants fresh data.
 */
const KICKOFF_LEAD_MS = 60 * 60 * 1000;
/**
 * How long a passed-kickoff game still counts as "delayed" rather than
 * "stuck": a real weather delay resolves within hours, while a feed anomaly
 * that leaves last Sunday's game in "pre" would otherwise hold the 2-minute
 * cadence for the rest of the week — thousands of silent requests against an
 * unofficial endpoint.
 */
const DELAY_GRACE_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
/** Sundays run ~200 KB; anything near this is not a scoreboard. */
const MAX_BYTES = 3_000_000;

const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

const CACHE_KIND = "nfl";
const CACHE_KEY = "scoreboard";

/** Only what we keep. Everything else in the feed is ignored, not trusted. */
const EspnEvent = z.object({
  // min(1): the web side's read-back schema requires a non-empty id, and an
  // entry that passes ingest but fails read-back would vanish silently there.
  id: z.string().min(1),
  date: z.string().min(1),
  status: z.object({
    period: z.number().int().optional(),
    displayClock: z.string().optional(),
    type: z.object({ state: z.enum(["pre", "in", "post"]), shortDetail: z.string().optional() }),
  }),
  competitions: z
    .array(
      z.object({
        competitors: z
          .array(
            z.object({
              id: z.string(),
              homeAway: z.enum(["home", "away"]),
              score: z.string().optional(),
              team: z.object({ abbreviation: z.string().min(1) }),
            }),
          )
          .min(2),
        situation: z
          .object({
            possession: z.string().optional(),
            shortDownDistanceText: z.string().optional(),
          })
          .optional(),
      }),
    )
    .min(1),
});

/** Events validate one by one below: one malformed game on a sixteen-game
 *  Sunday must not throw away the other fifteen. */
const EspnScoreboard = z.object({ events: z.array(z.unknown()) });

type NflGame = {
  id: string;
  date: string;
  state: "pre" | "in" | "post";
  period: number;
  clock: string;
  note: string;
  home: { abbr: string; score: number };
  away: { abbr: string; score: number };
  possession?: string;
  situation?: string;
};

function normalize(raw: unknown): { games: NflGame[] } {
  const body = EspnScoreboard.parse(raw);
  const games: NflGame[] = [];
  let skipped = 0;
  for (const entry of body.events) {
    const parsed = EspnEvent.safeParse(entry);
    if (!parsed.success) {
      skipped++;
      continue;
    }
    const e = parsed.data;
    const comp = e.competitions[0]!;
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    if (!home || !away) {
      // Counts toward the all-rejected guard below — an empty slate produced
      // by same-side pairs must throw like any other format break.
      skipped++;
      continue;
    }
    const live = e.status.type.state === "in";
    // The feed's possession field is a team *id*; translate to an abbreviation
    // or drop it — ids mean nothing to the renderer.
    const possession = live ? comp.competitors.find((c) => c.id === comp.situation?.possession)?.team.abbreviation : undefined;
    const situation = live ? comp.situation?.shortDownDistanceText : undefined;
    games.push({
      id: e.id,
      date: e.date,
      state: e.status.type.state,
      period: e.status.period ?? 0,
      clock: live ? (e.status.displayClock ?? "") : "",
      note: e.status.type.shortDetail ?? "",
      home: { abbr: home.team.abbreviation, score: Number(home.score ?? 0) || 0 },
      away: { abbr: away.team.abbreviation, score: Number(away.score ?? 0) || 0 },
      ...(possession ? { possession } : {}),
      ...(situation ? { situation } : {}),
    });
  }
  if (skipped > 0) log.warn("nfl events skipped by validation", { skipped, kept: games.length });
  // Per-entry salvage must not shade into total loss: if the feed HAD events
  // and none survived, the format has changed under us — throw, so the catch
  // in cycle() keeps the last good payload and records the error
  // (stale-but-labeled, per the header). An empty events array is different:
  // that is a real off-day and an honest empty slate.
  if (skipped > 0 && games.length === 0) throw new Error(`scoreboard format not recognized (${skipped} events rejected)`);
  games.sort((a, b) => a.date.localeCompare(b.date));
  return { games };
}

/** Any board with a team picked, or any scores widget, keeps the feed warm.
 *  Memoized for a minute: the answer only changes when a household picks a
 *  team or adds the widget, and both of those poke the worker anyway, so
 *  the 30s tick doesn't table-scan boards twice a minute for nothing. */
let watchingCache: { at: number; value: boolean } | null = null;

async function anyoneWatching(): Promise<boolean> {
  if (watchingCache && Date.now() - watchingCache.at < 60_000 && watchingCache.value) return true;
  const widget = await prisma.boardWidget.findFirst({ where: { type: "scores" }, select: { id: true } });
  let value = widget !== null;
  if (!value) {
    const boards = await prisma.board.findMany({ select: { style: true } });
    value = boards.some((b) => {
      const team = (b.style as { nflTeam?: unknown } | null)?.nflTeam;
      return typeof team === "string" && team.length > 0;
    });
  }
  watchingCache = { at: Date.now(), value };
  return value;
}

function dueForFetch(cached: { fetchedAt: Date; payload: unknown } | null, now: Date): boolean {
  if (!cached || cached.fetchedAt.getTime() <= 0) return true;
  const age = now.getTime() - cached.fetchedAt.getTime();
  if (age >= IDLE_REFETCH_MS) return true;
  const games = (cached.payload as { games?: NflGame[] } | null)?.games;
  if (!Array.isArray(games)) return true;
  const anyLive = games.some((g) => g.state === "in");
  if (anyLive) return age >= LIVE_REFETCH_MS;
  const imminent = games.some((g) => {
    if (g.state !== "pre") return false;
    const untilKickoff = new Date(g.date).getTime() - now.getTime();
    return untilKickoff <= KICKOFF_LEAD_MS && untilKickoff >= -DELAY_GRACE_MS;
  });
  return imminent && age >= PRE_LEAD_REFETCH_MS;
}

async function fetchScoreboard(): Promise<unknown> {
  const res = await fetch(SCOREBOARD_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": "FreeFamilyDisplay/0.1 (self-hosted family dashboard)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from scoreboard`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error("response too large");
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("response too large");
  return JSON.parse(text) as unknown;
}

async function cycle(): Promise<void> {
  if (!(await anyoneWatching())) return;
  const cached = await prisma.cachedPayload.findUnique({
    where: { kind_key: { kind: CACHE_KIND, key: CACHE_KEY } },
    select: { fetchedAt: true, payload: true },
  });
  if (!dueForFetch(cached, new Date())) return;

  try {
    const payload = normalize(await fetchScoreboard());
    await prisma.cachedPayload.upsert({
      where: { kind_key: { kind: CACHE_KIND, key: CACHE_KEY } },
      create: { kind: CACHE_KIND, key: CACHE_KEY, payload, fetchedAt: new Date() },
      update: { payload, fetchedAt: new Date(), lastError: null, lastErrorAt: null },
    });
    log.info("nfl scoreboard updated", { games: payload.games.length });
  } catch (err) {
    const message = (err instanceof Error ? err.message : "unknown error").slice(0, 255);
    // Keep the stale payload; record the error beside it.
    await prisma.cachedPayload
      .upsert({
        where: { kind_key: { kind: CACHE_KIND, key: CACHE_KEY } },
        create: { kind: CACHE_KIND, key: CACHE_KEY, payload: {}, fetchedAt: new Date(0), lastError: message, lastErrorAt: new Date() },
        update: { lastError: message, lastErrorAt: new Date() },
      })
      .catch(() => undefined);
    log.warn("nfl fetch failed", { error: message });
  }
}

let inFlight: Promise<void> | null = null;

/** Runs one cycle, or joins the one already running. Safe to call from anywhere. */
export function runNflCycle(): Promise<void> {
  if (!inFlight) {
    inFlight = cycle()
      .catch((err: unknown) => log.error("nfl cycle crashed", { error: err instanceof Error ? err.message : "unknown" }))
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Starts the loop. First run shortly after boot so a fresh pick fills in fast. */
export function startNflLoop(): () => void {
  const first = setTimeout(() => void runNflCycle(), 12_000);
  const every = setInterval(() => void runNflCycle(), NFL_TICK_MS);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
