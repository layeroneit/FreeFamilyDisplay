"use client";

import { useEffect, useState } from "react";
import { nflTeam, todaysGames, nextGame, type NflGame } from "@/lib/board/nfl";

/**
 * Live scores card, the operator's pick C3: the household's game rendered
 * huge — readable from the couch — with the rest of the league rotating
 * through two rows beneath it, three games on screen at a time.
 *
 * Authored in the widget's default units (480×360 card, 24px frame padding);
 * WidgetFrame scales the whole thing like every other widget. The page index
 * is derived from the wall clock, never accumulated — same reasoning as the
 * photo widget: the board reloads every five minutes, and a counter that
 * restarts at zero would never show page three.
 */

const PAGE_MS = 15_000;
const muted = { color: "var(--hearth-text-muted)" } as const;

function kickoffLabel(iso: string, withDay: boolean): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return withDay ? `${d.toLocaleDateString("en-US", { weekday: "short" })} ${time}` : time;
}

/** The little status column: kickoff time, quarter + clock, or Final. */
function statusText(g: NflGame): string {
  if (g.state === "pre") return kickoffLabel(g.date, false);
  if (g.state === "post") return g.note.includes("Final") ? g.note : "Final";
  // At halftime the feed keeps state "in" with a 0:00 clock; the note is the
  // honest label. (A clock=="" check can never fire here — live is the only
  // state the worker gives a clock at all.)
  if (/halftime/i.test(g.note)) return "Halftime";
  const q = g.period > 4 ? "OT" : `Q${g.period}`;
  return `${q} · ${g.clock}`;
}

function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function GameRow({ g }: { g: NflGame }) {
  const live = g.state === "in";
  const side = (abbr: string, score: number) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span style={{ fontFamily: "var(--hearth-font-display)", fontWeight: 700, fontSize: 21 }}>
        {abbr}
        {live && g.possession === abbr ? <span style={{ color: "var(--hearth-accent-4)", fontSize: 12, verticalAlign: 4, marginLeft: 6 }}>●</span> : null}
      </span>
      <span style={{ fontWeight: 700, fontSize: 21, fontVariantNumeric: "tabular-nums" }}>{g.state === "pre" ? "" : score}</span>
    </div>
  );
  return (
    <div
      data-part="score-row"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 14,
        background: "rgb(0 0 0 / 0.16)",
        border: "1px solid var(--hearth-border)",
        borderRadius: 12,
        padding: "7px 14px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        {side(g.away.abbr, g.away.score)}
        {side(g.home.abbr, g.home.score)}
      </div>
      <div style={{ ...muted, fontSize: 15, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", ...(live ? { color: "var(--hearth-accent-1)" } : {}) }}>
        {statusText(g)}
      </div>
    </div>
  );
}

export function ScoresWidget({
  games,
  syncedAtMs,
  error,
  team,
}: {
  games: NflGame[];
  syncedAtMs: number | null;
  error: string | null;
  team: string | null;
}) {
  // Wall-clock page index, corrected on mount (server renders page 0).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const at = () => Math.floor(Date.now() / PAGE_MS);
    setTick(at());
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => {
        setTick(at());
        arm();
      }, PAGE_MS - (Date.now() % PAGE_MS));
    };
    arm();
    return () => clearTimeout(timer);
  }, []);

  const now = new Date();
  const meta = nflTeam(team);
  const today = todaysGames(games, now);
  const hero = meta ? (today.find((g) => g.home.abbr === meta.abbr || g.away.abbr === meta.abbr) ?? null) : null;
  const rest = hero ? today.filter((g) => g.id !== hero.id) : today;
  const pages = chunk(rest, hero ? 2 : 3);
  const page = pages.length > 0 ? pages[tick % pages.length]! : [];
  const anyLive = today.some((g) => g.state === "in");
  // Stale-but-labeled (plan §3): once the last fetch is old enough that a
  // LIVE clock would visibly lie, the badge yields to an "as of" stamp. Only
  // while games are in progress — outside game windows the worker refetches
  // hourly BY DESIGN, and labeling healthy rationing as staleness would make
  // "as of" the widget's resting state. The 15-second page tick keeps this
  // current without its own timer.
  const stale = anyLive && syncedAtMs !== null && Date.now() - syncedAtMs > 10 * 60 * 1000;

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ fontFamily: "var(--hearth-font-display)", fontWeight: 700, fontSize: 20, letterSpacing: 2, textTransform: "uppercase" }}>
        NFL {now.toLocaleDateString("en-US", { weekday: "long" })}
      </span>
      {stale && syncedAtMs !== null ? (
        <span data-part="stale" style={{ ...muted, fontSize: 13 }}>
          as of {new Date(syncedAtMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
      ) : anyLive ? (
        <span data-part="live" style={{ color: "var(--hearth-accent-1)", fontSize: 14, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase" }}>
          <span className="scores-live-dot" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "currentColor", marginRight: 7, verticalAlign: 1 }} />
          Live
        </span>
      ) : syncedAtMs === null && error ? (
        <span style={{ ...muted, fontSize: 13 }}>offline</span>
      ) : null}
    </div>
  );

  // Quiet states first. "Warming up" is ONLY for a feed that has never
  // synced — a clean sync with an empty slate is the offseason, and it must
  // fall through to the honest rest-day copy, not promise scores for months.
  if (games.length === 0 && (syncedAtMs === null || error)) {
    return (
      <div data-part="scores" style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
        {header}
        <div style={{ ...muted, fontSize: 20, flex: 1, display: "flex", alignItems: "center" }}>
          {error ? `Scoreboard unreachable — it retries on its own. (${error})` : "Warming up… scores land within a few minutes."}
        </div>
      </div>
    );
  }
  if (today.length === 0) {
    const next = meta ? (nextGame(games.filter((g) => g.home.abbr === meta.abbr || g.away.abbr === meta.abbr), now) ?? nextGame(games, now)) : nextGame(games, now);
    return (
      <div data-part="scores" style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
        {header}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 600 }}>No games today.</div>
          {next ? (
            <div style={{ ...muted, fontSize: 19 }}>
              Next: {next.away.abbr} @ {next.home.abbr} · {kickoffLabel(next.date, true)}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const heroTeamHome = hero && meta ? hero.home.abbr === meta.abbr : false;
  const opp = hero ? (heroTeamHome ? hero.away.abbr : hero.home.abbr) : "";
  const ours = hero ? (heroTeamHome ? hero.home.score : hero.away.score) : 0;
  const theirs = hero ? (heroTeamHome ? hero.away.score : hero.home.score) : 0;

  return (
    <div data-part="scores" style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
      {header}
      {hero && meta ? (
        <div
          data-part="score-hero"
          style={{
            borderRadius: 14,
            border: "1px solid var(--hearth-border)",
            background: "rgb(0 0 0 / 0.22)",
            padding: "10px 16px 9px",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 14, whiteSpace: "nowrap" }}>
            <span
              style={{
                fontFamily: "var(--hearth-font-display)",
                fontStyle: "italic",
                fontWeight: 800,
                fontSize: 30,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "var(--hearth-accent-1)",
              }}
            >
              {meta.nickname}
            </span>
            {hero.state === "pre" ? (
              <span style={{ fontSize: 26, fontWeight: 600 }}>{heroTeamHome ? "vs" : "@"} {opp}</span>
            ) : (
              <>
                <span style={{ fontSize: 34, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {ours} – {theirs}
                </span>
                <span style={{ ...muted, fontFamily: "var(--hearth-font-display)", fontWeight: 700, fontSize: 20 }}>{opp}</span>
              </>
            )}
          </div>
          <div style={{ ...muted, fontSize: 15, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {hero.state === "pre" ? (
              <>Kickoff {kickoffLabel(hero.date, false)}</>
            ) : (
              <>
                <span style={hero.state === "in" ? { color: "var(--hearth-accent-1)", fontWeight: 600 } : undefined}>{statusText(hero)}</span>
                {hero.state === "in" && hero.possession === meta.abbr ? <> · {meta.nickname} ball{hero.situation ? ` · ${hero.situation}` : ""}</> : null}
              </>
            )}
          </div>
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0, overflow: "hidden" }}>
        {page.map((g) => (
          <GameRow key={g.id} g={g} />
        ))}
      </div>
      {pages.length > 1 ? (
        <div data-part="score-dots" style={{ display: "flex", justifyContent: "center", gap: 7, paddingBottom: 2 }}>
          {pages.map((_, i) => (
            <span
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: i === tick % pages.length ? "var(--hearth-accent-1)" : "var(--hearth-border)",
              }}
            />
          ))}
        </div>
      ) : null}
      {!meta ? <div style={{ ...muted, fontSize: 13 }}>Pick your team in Display settings to pin your game here.</div> : null}
    </div>
  );
}
