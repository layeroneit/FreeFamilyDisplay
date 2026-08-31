import { SEASON_DECOR, seasonFor, seasonalFrame, type Season } from "@/lib/board/season";

/**
 * Seasonal decor scattered down the four edges of the board — leaves in
 * autumn, snowflakes in winter, blossom in spring, sun and green in summer.
 *
 * A server component on purpose: the layout is a pure function of the season
 * and the canvas size, so there is nothing to hydrate and no JavaScript ships
 * for it. The gentle sway is CSS, which globals.css already disables wholesale
 * under prefers-reduced-motion.
 *
 * Sits at z-index 2 — above the wallpaper and the weather tint, below the
 * photo credit (5) and every widget (10+), so it can never cover content.
 */
export function SeasonalFrame({
  now,
  canvasW,
  canvasH,
  season,
}: {
  now: Date;
  canvasW: number;
  canvasH: number;
  /** Overrides the date-derived season (the editor preview uses this). */
  season?: Season;
}) {
  const s = season ?? seasonFor(now);
  const decor = SEASON_DECOR[s];
  const pieces = seasonalFrame(s, canvasW, canvasH);

  return (
    <div
      data-part="seasonal-frame"
      data-season={s}
      aria-hidden
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 2 }}
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
                opacity: p.opacity,
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
              {g.detail ? (
                <path
                  d={g.detail}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={filled ? 1.3 : 1.7}
                  strokeLinecap="round"
                  // On a glyph that is nothing BUT detail (a snowflake) the
                  // stroke is the whole shape and must not be ghosted.
                  opacity={filled ? 0.5 : 1}
                />
              ) : null}
            </svg>
          </div>
        );
      })}
    </div>
  );
}
