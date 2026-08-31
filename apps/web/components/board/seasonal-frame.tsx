import { SEASON_DECOR, seasonFor, seasonalFrame, type Season } from "@/lib/board/season";

/**
 * Seasonal decor scattered around the inside edges of the CALENDAR CARD —
 * leaves in autumn, snowflakes in winter, blossom in spring, sun and green in
 * summer.
 *
 * It used to line the whole board, and that was wrong (operator, 2026-08-31).
 * The board already has a weather layer: rain streaks, drifting snow, a
 * storm's lightning flash, plus the wallpaper the household chose. Decor
 * across the whole screen at z-index 2 drew autumn leaves ON TOP of the rain
 * and competed with every theme. Two ambient systems arguing over one piece
 * of glass is one too many, so the season now lives where it is actually
 * about something - the calendar - and the weather keeps the board.
 *
 * A server component on purpose: the layout is a pure function of the season
 * and the box it is given, so there is nothing to hydrate and no JavaScript
 * ships for it. The gentle sway is CSS, which globals.css already disables
 * wholesale under prefers-reduced-motion.
 */
export function SeasonalFrame({
  now,
  boxW,
  boxH,
  season,
  opacityScale = 1,
}: {
  now: Date;
  /** The box to line, in the coordinate space the caller draws in. */
  boxW: number;
  boxH: number;
  /** Overrides the date-derived season (the editor preview uses this). */
  season?: Season;
  /**
   * Dimmer inside a card than on open board, because here the decor sits
   * behind dates and event titles that have to stay readable.
   */
  opacityScale?: number;
}) {
  const s = season ?? seasonFor(now);
  const decor = SEASON_DECOR[s];
  const pieces = seasonalFrame(s, boxW, boxH);

  return (
    <div
      data-part="seasonal-frame"
      data-season={s}
      aria-hidden
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}
    >
      {pieces.map((p, i) => {
        const g = decor.glyphs[p.glyph]!;
        const filled = Boolean(g.paths?.length || g.circles?.length);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              // Base rotation lives on the wrapper so the sway keyframes,
              // which are also transforms, don't overwrite it.
              transform: `rotate(${p.rot}deg)`,
            }}
          >
            <svg
              className="season-sway"
              viewBox="0 0 24 24"
              width="100%"
              height="100%"
              style={{
                display: "block",
                color: p.color,
                opacity: +(p.opacity * opacityScale).toFixed(3),
                animationDuration: `${p.dur}s`,
                animationDelay: `-${p.delay}s`,
                filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.35))",
              }}
            >
              <g fill="currentColor">
                {g.paths?.map((d, j) => (
                  <path key={j} d={d} />
                ))}
                {g.circles?.map((c, j) => (
                  <circle key={j} cx={c.cx} cy={c.cy} r={c.r} />
                ))}
              </g>
              {/* Line work that leaves the silhouette keeps the piece's colour. */}
              {g.detail ? (
                <path d={g.detail} fill="none" stroke="currentColor" strokeWidth={filled ? 1.5 : 1.7} strokeLinecap="round" strokeLinejoin="round" />
              ) : null}
              {/* Marks lying ON the fill must be darker than it. currentColor
                  was the same colour as the fill, so every leaf vein was
                  invisible and an autumn leaf came out a featureless blob. */}
              {g.veins ? (
                <path d={g.veins} fill="none" stroke="rgb(0 0 0 / 0.38)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
              ) : null}
            </svg>
          </div>
        );
      })}
    </div>
  );
}
