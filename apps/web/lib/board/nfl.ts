/**
 * NFL game day — pure data + pure date logic, in the season.ts mold: no
 * server-only imports, unit-testable, the renderer stays dumb.
 *
 * Three consumers share this file: the scene loader (does the household's team
 * play today, and what does the board wear when it does), the scores widget
 * (normalized live scores out of the worker's cache), and the celebration
 * overlay (which hype line does this half hour get).
 *
 * Deliberately NO league or team logo artwork anywhere in here — those marks
 * are trademarked and this repo is public Apache-2.0. Team names and colors
 * are uncopyrightable facts; the on-screen "wordmark" is the nickname set in
 * our own display type. The color table is hand-curated rather than taken
 * from the feed: every `bg` below is dark enough to carry #F5EFE6 text, which
 * an arbitrary feed color (a gold, a powder blue) cannot promise.
 */

import { z } from "zod";
import type { SeasonGlyph } from "./season";

/* ------------------------------------------------------------------ teams */

export type NflTeam = {
  /** ESPN scoreboard abbreviation — the join key against the feed. */
  abbr: string;
  city: string;
  nickname: string;
  /** One friendly glyph for the celebration's emoji row. */
  emoji: string;
  /** Board background on game day. Curated dark — see the header comment. */
  bg: string;
  /** The pop color: wordmark, pinned-game stripe, confetti. */
  accent: string;
  /** Second confetti/accent color. */
  accent2: string;
};

export const NFL_TEAMS: readonly NflTeam[] = [
  { abbr: "ARI", city: "Arizona", nickname: "Cardinals", emoji: "🐦", bg: "#97233F", accent: "#FFB612", accent2: "#FFFFFF" },
  { abbr: "ATL", city: "Atlanta", nickname: "Falcons", emoji: "🦅", bg: "#16171B", accent: "#A71930", accent2: "#A5ACAF" },
  { abbr: "BAL", city: "Baltimore", nickname: "Ravens", emoji: "🐦‍⬛", bg: "#241773", accent: "#E8B84C", accent2: "#C60C30" },
  { abbr: "BUF", city: "Buffalo", nickname: "Bills", emoji: "🦬", bg: "#00338D", accent: "#C60C30", accent2: "#FFFFFF" },
  { abbr: "CAR", city: "Carolina", nickname: "Panthers", emoji: "🐈‍⬛", bg: "#101820", accent: "#0085CA", accent2: "#BFC0BF" },
  { abbr: "CHI", city: "Chicago", nickname: "Bears", emoji: "🐻", bg: "#0B1C3A", accent: "#E64100", accent2: "#F5EFE6" },
  { abbr: "CIN", city: "Cincinnati", nickname: "Bengals", emoji: "🐯", bg: "#17181A", accent: "#FB4F14", accent2: "#FFFFFF" },
  { abbr: "CLE", city: "Cleveland", nickname: "Browns", emoji: "🐶", bg: "#311D00", accent: "#FF3C00", accent2: "#FFFFFF" },
  { abbr: "DAL", city: "Dallas", nickname: "Cowboys", emoji: "⭐", bg: "#003594", accent: "#FFFFFF", accent2: "#869397" },
  { abbr: "DEN", city: "Denver", nickname: "Broncos", emoji: "🐴", bg: "#0A2343", accent: "#FB4F14", accent2: "#FFFFFF" },
  { abbr: "DET", city: "Detroit", nickname: "Lions", emoji: "🦁", bg: "#005A8B", accent: "#B0B7BC", accent2: "#FFFFFF" },
  { abbr: "GB", city: "Green Bay", nickname: "Packers", emoji: "🧀", bg: "#203731", accent: "#FFB612", accent2: "#FFFFFF" },
  { abbr: "HOU", city: "Houston", nickname: "Texans", emoji: "🤠", bg: "#03202F", accent: "#A71930", accent2: "#FFFFFF" },
  { abbr: "IND", city: "Indianapolis", nickname: "Colts", emoji: "🐎", bg: "#002C5F", accent: "#FFFFFF", accent2: "#A2AAAD" },
  { abbr: "JAX", city: "Jacksonville", nickname: "Jaguars", emoji: "🐆", bg: "#101820", accent: "#00A9B7", accent2: "#9F792C" },
  { abbr: "KC", city: "Kansas City", nickname: "Chiefs", emoji: "🏹", bg: "#9E0B1F", accent: "#FFB81C", accent2: "#FFFFFF" },
  { abbr: "LAC", city: "Los Angeles", nickname: "Chargers", emoji: "⚡", bg: "#0A2342", accent: "#FFC20E", accent2: "#0080C6" },
  { abbr: "LAR", city: "Los Angeles", nickname: "Rams", emoji: "🐏", bg: "#003594", accent: "#FFA300", accent2: "#FFFFFF" },
  { abbr: "LV", city: "Las Vegas", nickname: "Raiders", emoji: "🏴‍☠️", bg: "#101014", accent: "#A5ACAF", accent2: "#FFFFFF" },
  { abbr: "MIA", city: "Miami", nickname: "Dolphins", emoji: "🐬", bg: "#00666E", accent: "#FC4C02", accent2: "#FFFFFF" },
  { abbr: "MIN", city: "Minnesota", nickname: "Vikings", emoji: "🛡️", bg: "#4F2683", accent: "#FFC62F", accent2: "#FFFFFF" },
  { abbr: "NE", city: "New England", nickname: "Patriots", emoji: "🇺🇸", bg: "#002244", accent: "#C60C30", accent2: "#B0B7BC" },
  { abbr: "NO", city: "New Orleans", nickname: "Saints", emoji: "⚜️", bg: "#101820", accent: "#D3BC8D", accent2: "#FFFFFF" },
  { abbr: "NYG", city: "New York", nickname: "Giants", emoji: "🗽", bg: "#0B2265", accent: "#A71930", accent2: "#FFFFFF" },
  { abbr: "NYJ", city: "New York", nickname: "Jets", emoji: "✈️", bg: "#125740", accent: "#FFFFFF", accent2: "#000000" },
  { abbr: "PHI", city: "Philadelphia", nickname: "Eagles", emoji: "🦅", bg: "#004C54", accent: "#A5ACAF", accent2: "#FFFFFF" },
  { abbr: "PIT", city: "Pittsburgh", nickname: "Steelers", emoji: "⚒️", bg: "#101820", accent: "#FFB612", accent2: "#FFFFFF" },
  { abbr: "SEA", city: "Seattle", nickname: "Seahawks", emoji: "🦚", bg: "#002244", accent: "#69BE28", accent2: "#A5ACAF" },
  { abbr: "SF", city: "San Francisco", nickname: "49ers", emoji: "⛏️", bg: "#8A0000", accent: "#B3995D", accent2: "#FFFFFF" },
  { abbr: "TB", city: "Tampa Bay", nickname: "Buccaneers", emoji: "🏴‍☠️", bg: "#8F0B0B", accent: "#FF7900", accent2: "#B1BABF" },
  { abbr: "TEN", city: "Tennessee", nickname: "Titans", emoji: "🔥", bg: "#0C2340", accent: "#4B92DB", accent2: "#C8102E" },
  { abbr: "WSH", city: "Washington", nickname: "Commanders", emoji: "🎖️", bg: "#5A1414", accent: "#FFB612", accent2: "#FFFFFF" },
];

export const NFL_TEAM_IDS = NFL_TEAMS.map((t) => t.abbr) as [string, ...string[]];

const BY_ABBR = new Map(NFL_TEAMS.map((t) => [t.abbr, t]));

export function isNflTeamId(v: string): boolean {
  return BY_ABBR.has(v);
}

export function nflTeam(abbr: string | null | undefined): NflTeam | null {
  return abbr ? (BY_ABBR.get(abbr) ?? null) : null;
}

/* -------------------------------------------------------------- the cache */

/**
 * The worker's normalized scoreboard, re-validated on the way OUT of the
 * database (CLAUDE.md: external payloads are a trust boundary, and the worker
 * and web validate independently — same arrangement as weather).
 */
export const NflGameSchema = z.object({
  id: z.string().min(1),
  /** Kickoff, ISO 8601 with offset. Rendered in the household's own clock. */
  date: z.string().min(1),
  state: z.enum(["pre", "in", "post"]),
  /** Quarter 1-4 (5+ = overtime); 0 before kickoff. */
  period: z.number().int().min(0),
  /** Game clock as the broadcast writes it, e.g. "4:12"; "" outside play. */
  clock: z.string(),
  /** The feed's own status line — "Final", "Final/OT", "Halftime". */
  note: z.string(),
  home: z.object({ abbr: z.string().min(1), score: z.number().int().min(0) }),
  away: z.object({ abbr: z.string().min(1), score: z.number().int().min(0) }),
  /** Abbreviation of the team holding the ball, live games only. */
  possession: z.string().optional(),
  /** "3rd & 4", live games only. */
  situation: z.string().optional(),
});
export type NflGame = z.infer<typeof NflGameSchema>;

export const NflPayloadSchema = z.object({ games: z.array(NflGameSchema) });
export type NflPayload = z.infer<typeof NflPayloadSchema>;

/**
 * Salvaging parse of the cached payload: bad entries are dropped, good ones
 * survive. An all-or-nothing parse let one malformed game silently zero the
 * whole slate — which un-themed the board mid-Sunday with no trace. Returns
 * how many were dropped so the caller can log it.
 */
export function parseNflPayload(raw: unknown): { games: NflGame[]; dropped: number } | null {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { games?: unknown }).games)) return null;
  const games: NflGame[] = [];
  let dropped = 0;
  for (const g of (raw as { games: unknown[] }).games) {
    const parsed = NflGameSchema.safeParse(g);
    if (parsed.success) games.push(parsed.data);
    else dropped++;
  }
  return { games, dropped };
}

/** CachedPayload coordinates — one row serves every board in the house. */
export const NFL_CACHE_KIND = "nfl";
export const NFL_CACHE_KEY = "scoreboard";

/* --------------------------------------------------------------- game day */

const sameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Games kicking off on the household's own calendar day. */
export function todaysGames(games: readonly NflGame[], now: Date): NflGame[] {
  return games.filter((g) => sameLocalDay(new Date(g.date), now));
}

/** The next unplayed game after `now`, for the quiet "no games today" state. */
export function nextGame(games: readonly NflGame[], now: Date): NflGame | null {
  const upcoming = games
    .filter((g) => g.state === "pre" && new Date(g.date).getTime() > now.getTime())
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] ?? null;
}

export type GameDay = {
  team: NflTeam;
  game: NflGame;
  /** Kickoff in real time — the celebration sizes its blowout around this. */
  kickoff: Date;
};

/** Non-null exactly when the chosen team kicks off on the local calendar today. */
export function gameDayFor(games: readonly NflGame[], teamAbbr: string | null, now: Date): GameDay | null {
  const team = nflTeam(teamAbbr);
  if (!team) return null;
  const game = todaysGames(games, now).find((g) => g.home.abbr === team.abbr || g.away.abbr === team.abbr);
  return game ? { team, game, kickoff: new Date(game.date) } : null;
}

/* ------------------------------------------------------------- the colors */

/** Mix `hex` toward white by t (0..1). Inputs are our own table, always #RRGGBB. */
function lighten(hex: string, t: number): string {
  const ch = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(v + (255 - v) * t);
  };
  return `#${[ch(0), ch(1), ch(2)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The full-takeover overrides (the operator's pick A3): every board token
 * swaps to team colors for the day, layered over the theme the same way the
 * wallpaper overrides are. Reverts by simply not being applied tomorrow.
 */
export function gameDayVars(team: NflTeam): Record<string, string> {
  return {
    "--hearth-bg": team.bg,
    "--hearth-surface": lighten(team.bg, 0.09),
    "--hearth-border": lighten(team.bg, 0.22),
    "--hearth-text": "#F5EFE6",
    "--hearth-text-muted": lighten(team.bg, 0.55),
    "--hearth-accent-1": team.accent,
    "--hearth-accent-2": team.accent2,
    "--hearth-accent-3": lighten(team.accent, 0.35),
    "--hearth-accent-4": "#FFD23F",
  };
}

/* ------------------------------------------------------------- the hype */

export type HypeLine = { top: string; sub?: string };

/**
 * Famous, long-established fan chants only — the kind sung in the stadium for
 * decades. Anything not on this list gets the generated set, which is plenty.
 */
const TEAM_CHANTS: Record<string, HypeLine[]> = {
  CHI: [{ top: "DA BEARS!" }, { top: "BEAR DOWN!", sub: "CHICAGO FOOTBALL!" }, { top: "MONSTERS OF THE MIDWAY" }],
  GB: [{ top: "GO PACK GO!" }],
  BUF: [{ top: "LET'S GO BUFFALO!" }],
  PHI: [{ top: "FLY EAGLES FLY!" }],
  MIN: [{ top: "SKOL!", sub: "VIKINGS!" }],
  NO: [{ top: "WHO DAT!" }],
  KC: [{ top: "CHIEFS KINGDOM!" }],
  LV: [{ top: "RAIDER NATION!" }],
  PIT: [{ top: "HERE WE GO STEELERS!" }],
  SEA: [{ top: "GO HAWKS!" }],
  DAL: [{ top: "HOW 'BOUT THEM COWBOYS!" }],
};

/** The rotation the celebration walks through, one line per half hour. */
export function hypeLines(team: NflTeam): HypeLine[] {
  const nick = team.nickname.toUpperCase();
  return [
    { top: `${nick} DAY!`, sub: "LET'S GO!" },
    { top: "IT'S GAME DAY!", sub: `GO ${nick}!` },
    ...(TEAM_CHANTS[team.abbr] ?? []),
    { top: `${team.city.toUpperCase()} FOOTBALL!` },
  ];
}

/**
 * Which line this half hour gets. Indexed off the local wall clock, so every
 * display in the house shouts the same thing at the same time, and a page
 * refresh mid-slot repeats rather than reshuffles.
 */
export function hypeForSlot(lines: readonly HypeLine[], now: Date): HypeLine {
  const slot = Math.floor((now.getHours() * 60 + now.getMinutes()) / 30);
  return lines[slot % lines.length]!;
}

/**
 * True when `now` is the ONE half-hour boundary nearest kickoff. A symmetric
 * time window fails for :15/:45 kickoffs (Monday night is 8:15): both
 * neighbouring boundaries sit 15 minutes away and the blowout fired twice.
 * Rounding kickoff to its nearest slot index (ties go late, so an 8:15
 * kickoff celebrates at 8:30, after the ball is actually in the air) fires
 * exactly once. Computed in local wall-clock terms like every boundary here.
 */
export function isKickoffSlot(kickoff: Date, now: Date): boolean {
  if (!sameLocalDay(kickoff, now)) return false;
  const nowSlot = Math.round((now.getHours() * 60 + now.getMinutes()) / 30);
  const kickoffSlot = Math.round((kickoff.getHours() * 60 + kickoff.getMinutes()) / 30);
  return nowSlot === kickoffSlot;
}

/* ------------------------------------------------------------- the sky */

/**
 * A football for the game-day sky, drawn to the season.ts glyph rules: the
 * silhouette carries the meaning in one colour; the laces are `veins` (dark,
 * on-fill only). Rendered to a specimen sheet and looked at before shipping,
 * per the hard-won rule in season.ts.
 */
export const FOOTBALL_GLYPH: SeasonGlyph = {
  name: "football",
  paths: ["M2.2 12C4.1 7.1 7.9 4.6 12 4.6s7.9 2.5 9.8 7.4c-1.9 4.9-5.7 7.4-9.8 7.4S4.1 16.9 2.2 12Z"],
  veins: "M8.4 12h7.2M9.9 10.5v3M12 10.3v3.4M14.1 10.5v3",
};
