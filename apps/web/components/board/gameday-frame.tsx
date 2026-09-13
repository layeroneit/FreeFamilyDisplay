import { holidayFall } from "@/lib/board/season";
import { FOOTBALL_GLYPH } from "@/lib/board/nfl";

/** Pigskin browns — three close shades so the sky has depth, none of them
 *  anywhere near an autumn palette's oranges. */
const LEATHER = ["#7B3F1D", "#8B4A21", "#5E2F14"];

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
  canvasW,
  canvasH,
}: {
  /** Team abbreviation — the seed, so every refresh resumes the same sky. */
  team: string;
  canvasW: number;
  canvasH: number;
}) {
  // The football glyph on statement-piece physics scaled for a FULL canvas —
  // the shared holiday profile is tuned for a calendar card and put ~8 small
  // glyphs on a 1920×1080 wall, which read as dust, not a sky.
  //
  // LEATHER, not team colors: in September the autumn leaves are already
  // falling in oranges, and team-colored footballs read as more leaves
  // (operator, on the wall, 2026-09-13). A brown ball with white laces is the
  // one thing that cannot be mistaken for foliage — the team identity lives
  // in the takeover, the badge, and the celebrations.
  const pieces = holidayFall({ id: `gameday:${team}`, glyphs: [FOOTBALL_GLYPH], palette: LEATHER }, canvasW, canvasH, {
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
              // Remap the generator's ambient 0.4–0.6 into 0.7–0.9: solid
              // enough to be seen (a 0.4 football fades into the wallpaper)
              // while keeping the per-piece variance that reads as depth.
              opacity: +(0.3 + p.opacity).toFixed(2),
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
              // White laces on brown leather — the real object, and the detail
              // that makes it a football at a glance instead of one more leaf.
              <path d={FOOTBALL_GLYPH.veins} fill="none" stroke="rgb(255 255 255 / 0.9)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
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
