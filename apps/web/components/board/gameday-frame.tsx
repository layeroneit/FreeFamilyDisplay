import { holidayFall } from "@/lib/board/season";
import { FOOTBALL_GLYPH } from "@/lib/board/nfl";

/**
 * Game day's board dressing, the operator's pick A3: footballs drifting down
 * the whole board on the seasonal-fall physics, and the team wordmark parked
 * in the bottom-right corner.
 *
 * The sky sits at z-index 1 — UNDER the weather layer's rain (z 2) and every
 * widget (z 10+). The seasonal decor learned this the hard way (2026-08-31):
 * ambient pieces drawn OVER the rain read as a bug. Down here the footballs
 * drift behind the cards like the wallpaper breathing, and the rain, if the
 * household has weather mood on, still owns the foreground.
 *
 * The wordmark is our own display type, deliberately not league artwork —
 * this repo is public Apache-2.0 and team logos are trademarked. The word in
 * team colors is the point anyway: it is what the family shouts.
 */
export function GameDaySky({
  team,
  accent,
  accent2,
  canvasW,
  canvasH,
}: {
  /** Team abbreviation — the seed, so every refresh resumes the same sky. */
  team: string;
  accent: string;
  accent2: string;
  canvasW: number;
  canvasH: number;
}) {
  // The football glyph on statement-piece physics scaled for a FULL canvas —
  // the shared holiday profile is tuned for a calendar card and put ~8 small
  // glyphs on a 1920×1080 wall, which read as dust, not a sky. No gold in the
  // palette: on the specimen sheet a yellow football reads as a lemon.
  const pieces = holidayFall({ id: `gameday:${team}`, glyphs: [FOOTBALL_GLYPH], palette: [accent, accent2] }, canvasW, canvasH, {
    count: [11, 14],
    size: [52, 88],
    dur: [35, 60],
    rock: [22, 38],
    sway: [14, 30],
  });
  return (
    <div
      data-part="gameday-sky"
      aria-hidden
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 1 }}
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className="season-descend"
          style={
            {
              position: "absolute",
              left: p.x,
              top: -p.size * 1.5,
              width: p.size,
              height: p.size,
              opacity: p.opacity,
              animationDuration: `${p.dur}s`,
              animationDelay: `-${p.delay}s`,
              "--sf-fall": `${canvasH + p.size * 3}px`,
              "--sf-drift": `${p.drift}px`,
            } as React.CSSProperties
          }
        >
          <svg
            viewBox="0 0 24 24"
            width="100%"
            height="100%"
            className="season-flutter"
            style={
              {
                display: "block",
                color: p.color,
                animationDuration: `${p.flutterDur}s`,
                animationDelay: `-${p.flutterDelay}s`,
                "--sf-sway": `${p.sway}px`,
                "--sf-rock": `${p.rock}deg`,
              } as React.CSSProperties
            }
          >
            <g fill="currentColor">
              {FOOTBALL_GLYPH.paths?.map((d, j) => (
                <path key={j} d={d} />
              ))}
            </g>
            {FOOTBALL_GLYPH.veins ? (
              <path d={FOOTBALL_GLYPH.veins} fill="none" stroke="rgb(0 0 0 / 0.38)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
            ) : null}
          </svg>
        </span>
      ))}
    </div>
  );
}

/** The corner wordmark: "BEARS" big, "GAME DAY" whispered under it. */
export function GameDayBadge({ nickname, accent, canvasW }: { nickname: string; accent: string; canvasW: number }) {
  const word = nickname.toUpperCase();
  const unit = canvasW / 1920;
  // Long nicknames (BUCCANEERS, COMMANDERS) shrink instead of colliding with
  // whatever widget lives along the bottom edge.
  const size = Math.min(150 * unit, (canvasW * 0.34) / (word.length * 0.52));
  return (
    <div
      data-part="gameday-badge"
      aria-hidden
      style={{ position: "absolute", right: 44 * unit, bottom: 30 * unit, zIndex: 6, textAlign: "right", pointerEvents: "none" }}
    >
      <div
        style={{
          fontFamily: "var(--hearth-font-display)",
          fontStyle: "italic",
          fontWeight: 800,
          fontSize: Math.round(size),
          lineHeight: 1,
          letterSpacing: 1,
          color: accent,
          textShadow: "0 4px 26px rgb(0 0 0 / 0.5), 0 1px 0 rgb(255 255 255 / 0.22)",
        }}
      >
        {word}
      </div>
      <div
        style={{
          fontFamily: "var(--hearth-font-display)",
          fontWeight: 700,
          fontSize: Math.round(Math.max(15, size * 0.16)),
          letterSpacing: "0.34em",
          textTransform: "uppercase",
          color: "var(--hearth-text)",
          opacity: 0.82,
          marginTop: Math.round(6 * unit),
          marginRight: 2,
        }}
      >
        Game day
      </div>
    </div>
  );
}
