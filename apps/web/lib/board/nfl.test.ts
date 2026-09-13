import assert from "node:assert/strict";
import test from "node:test";
import {
  FOOTBALL_GLYPH,
  NFL_TEAMS,
  NflPayloadSchema,
  gameDayFor,
  gameDayVars,
  hypeForSlot,
  hypeLines,
  isKickoffSlot,
  isNflTeamId,
  nextGame,
  nflTeam,
  parseNflPayload,
  todaysGames,
  type NflGame,
} from "./nfl";

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** sRGB relative luminance, same math as themes.ts bgLuminance. */
function luminance(hex: string): number {
  const ch = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
}

function game(over: Partial<NflGame> & { id: string; date: string }): NflGame {
  return {
    state: "pre",
    period: 0,
    clock: "",
    note: "",
    home: { abbr: "CAR", score: 0 },
    away: { abbr: "CHI", score: 0 },
    ...over,
  };
}

test("all 32 teams, unique abbreviations, plausible colors", () => {
  assert.equal(NFL_TEAMS.length, 32);
  assert.equal(new Set(NFL_TEAMS.map((t) => t.abbr)).size, 32);
  for (const t of NFL_TEAMS) {
    assert.match(t.bg, HEX, t.abbr);
    assert.match(t.accent, HEX, t.abbr);
    assert.match(t.accent2, HEX, t.abbr);
    // The takeover paints #F5EFE6 text over bg: every bg must stay dark. This
    // is the reason the table is curated instead of read from the feed.
    assert.ok(luminance(t.bg) < 0.3, `${t.abbr} bg ${t.bg} too light for the takeover text`);
    assert.ok(t.nickname.length >= 4 && t.nickname.length <= 10, t.abbr);
  }
  assert.ok(isNflTeamId("CHI"));
  assert.ok(!isNflTeamId("XYZ"));
  assert.equal(nflTeam("CHI")?.nickname, "Bears");
  assert.equal(nflTeam(null), null);
});

test("game day fires exactly on the team's local calendar day", () => {
  const now = new Date(2026, 8, 13, 9, 0); // Sunday morning, local
  const games: NflGame[] = [
    game({ id: "1", date: new Date(2026, 8, 13, 12, 0).toISOString() }), // CHI @ CAR today
    game({ id: "2", date: new Date(2026, 8, 14, 20, 15).toISOString(), home: { abbr: "KC", score: 0 }, away: { abbr: "DEN", score: 0 } }),
  ];
  const gd = gameDayFor(games, "CHI", now);
  assert.ok(gd);
  assert.equal(gd.game.id, "1");
  assert.equal(gd.team.abbr, "CHI");
  assert.equal(gd.kickoff.getTime(), new Date(2026, 8, 13, 12, 0).getTime());
  // The Monday team does not celebrate on Sunday.
  assert.equal(gameDayFor(games, "KC", now), null);
  // No team picked, no game day.
  assert.equal(gameDayFor(games, null, now), null);
  // A game late YESTERDAY is not today, even within 24 hours.
  const lateGames = [game({ id: "3", date: new Date(2026, 8, 12, 23, 30).toISOString() })];
  assert.equal(gameDayFor(lateGames, "CHI", now), null);
  assert.equal(todaysGames(lateGames, now).length, 0);
});

test("nextGame skips finished and started games", () => {
  const now = new Date(2026, 8, 13, 15, 0);
  const games: NflGame[] = [
    game({ id: "done", date: new Date(2026, 8, 13, 12, 0).toISOString(), state: "post" }),
    game({ id: "live", date: new Date(2026, 8, 13, 14, 25).toISOString(), state: "in" }),
    game({ id: "next", date: new Date(2026, 8, 13, 19, 20).toISOString() }),
    game({ id: "later", date: new Date(2026, 8, 14, 20, 15).toISOString() }),
  ];
  assert.equal(nextGame(games, now)?.id, "next");
  assert.equal(nextGame([], now), null);
});

test("hype lines rotate deterministically through the half hours", () => {
  const bears = nflTeam("CHI")!;
  const lines = hypeLines(bears);
  assert.ok(lines.length >= 4);
  assert.equal(lines[0]!.top, "BEARS DAY!");
  assert.ok(lines.some((l) => l.top === "DA BEARS!"));
  // Same slot, same line — every display in the house shouts together.
  const a = hypeForSlot(lines, new Date(2026, 8, 13, 10, 0));
  const b = hypeForSlot(lines, new Date(2026, 8, 13, 10, 29));
  assert.deepEqual(a, b);
  // Consecutive slots move on.
  const c = hypeForSlot(lines, new Date(2026, 8, 13, 10, 30));
  assert.notDeepEqual(a, c);
  // A team with no famous chant still gets a full generated set.
  const jags = nflTeam("JAX")!;
  assert.ok(hypeLines(jags).length >= 3);
});

test("exactly ONE boundary per kickoff earns the blowout", () => {
  // Noon kickoff: the noon boundary, and only the noon boundary.
  const noon = new Date(2026, 8, 13, 12, 0);
  assert.ok(isKickoffSlot(noon, new Date(2026, 8, 13, 12, 0)));
  assert.ok(!isKickoffSlot(noon, new Date(2026, 8, 13, 11, 30)));
  assert.ok(!isKickoffSlot(noon, new Date(2026, 8, 13, 12, 30)));
  // Monday night, 8:15 — equidistant from two boundaries. A symmetric window
  // fired the blowout TWICE here (audit finding); ties go late, once.
  const mnf = new Date(2026, 8, 14, 20, 15);
  assert.ok(!isKickoffSlot(mnf, new Date(2026, 8, 14, 20, 0)));
  assert.ok(isKickoffSlot(mnf, new Date(2026, 8, 14, 20, 30)));
  assert.ok(!isKickoffSlot(mnf, new Date(2026, 8, 14, 21, 0)));
  // Late-window 4:25: nearest boundary is 4:30.
  const late = new Date(2026, 8, 13, 16, 25);
  assert.ok(isKickoffSlot(late, new Date(2026, 8, 13, 16, 30)));
  assert.ok(!isKickoffSlot(late, new Date(2026, 8, 13, 16, 0)));
  // Another day never matches, even at the same wall-clock slot.
  assert.ok(!isKickoffSlot(noon, new Date(2026, 8, 14, 12, 0)));
});

test("a malformed game is dropped without zeroing the slate", () => {
  const good = {
    id: "401",
    date: "2026-09-13T17:00Z",
    state: "post",
    period: 4,
    clock: "",
    note: "Final",
    home: { abbr: "CAR", score: 10 },
    away: { abbr: "CHI", score: 17 },
  };
  const r = parseNflPayload({ games: [good, { id: "" }, 42] });
  assert.ok(r);
  assert.equal(r.games.length, 1);
  assert.equal(r.dropped, 2);
  assert.equal(r.games[0]!.id, "401");
  // Junk containers are a null, not a throw.
  assert.equal(parseNflPayload(null), null);
  assert.equal(parseNflPayload({ games: "nope" }), null);
});

test("takeover vars cover the token contract in valid hex", () => {
  const vars = gameDayVars(nflTeam("CHI")!);
  for (const key of ["--hearth-bg", "--hearth-surface", "--hearth-border", "--hearth-text", "--hearth-text-muted", "--hearth-accent-1", "--hearth-accent-2", "--hearth-accent-3", "--hearth-accent-4"]) {
    assert.match(vars[key] ?? "", HEX, key);
  }
  // Surface sits between bg and border on the way toward light.
  assert.ok(luminance(vars["--hearth-bg"]!) < luminance(vars["--hearth-surface"]!));
  assert.ok(luminance(vars["--hearth-surface"]!) < luminance(vars["--hearth-border"]!));
});

test("cached payload schema accepts the worker's shape and rejects junk", () => {
  const good = {
    games: [
      {
        id: "401",
        date: "2026-09-13T17:00Z",
        state: "in",
        period: 3,
        clock: "4:12",
        note: "",
        home: { abbr: "CAR", score: 10 },
        away: { abbr: "CHI", score: 17 },
        possession: "CHI",
        situation: "3rd & 4",
      },
    ],
  };
  assert.ok(NflPayloadSchema.safeParse(good).success);
  assert.ok(!NflPayloadSchema.safeParse({ games: [{ id: "x" }] }).success);
  assert.ok(!NflPayloadSchema.safeParse({}).success);
});

test("the football glyph follows the season.ts rules", () => {
  // Silhouette carries the shape; laces are veins (dark, on-fill only).
  assert.ok((FOOTBALL_GLYPH.paths ?? []).length >= 1);
  assert.ok((FOOTBALL_GLYPH.veins ?? "").length > 0);
});
