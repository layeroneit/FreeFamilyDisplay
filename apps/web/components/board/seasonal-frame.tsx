import { PETAL_GLYPH, SEASON_DECOR, seasonFor, seasonalFall, type Season, type SeasonGlyph } from "@/lib/board/season";

/**
 * The season, falling through the calendar card. Leaves tumble in autumn,
 * snow drifts in winter, petals flutter in spring; summer holds still and
 * glows - fireflies pulsing where the others would fall (operator's pick,
 * 2026-08-31).
 *
 * Scoped to the calendar card ONLY. The board belongs to the wallpaper and
 * the weather layer; this must never end up drawn over the rain.
 *
 * Still a server component: every piece is a pure function of season and card
 * size, animated by CSS keyframes carrying per-piece custom properties. The
 * kiosk demonstrably runs this kind of animation (the rain), and globals.css
 * kills it wholesale under prefers-reduced-motion. Seeded, so the five-minute
 * refresh resumes the same sky rather than reshuffling it - a negative
 * animation-delay means every piece is already mid-fall on first paint.
 */
export function SeasonalFrame({
  now,
  boxW,
  boxH,
  season,
}: {
  now: Date;
  /** The card interior, in the coordinate space the caller draws in. */
  boxW: number;
  boxH: number;
  /** Overrides the date-derived season (previews use this). */
  season?: Season;
}) {
  const s = season ?? seasonFor(now);
  const decor = SEASON_DECOR[s];
  const pieces = seasonalFall(s, boxW, boxH);

  return (
    <div
      data-part="seasonal-fall"
      data-season={s}
      aria-hidden
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}
    >
      {pieces.map((p, i) => {
        if (p.kind === "firefly") {
          return (
            <span
              key={i}
              className="season-firefly"
              style={
                {
                  position: "absolute",
                  left: p.x,
                  top: p.y,
                  width: p.size,
                  height: p.size,
                  borderRadius: "50%",
                  background: p.color,
                  boxShadow: `0 0 ${p.size * 1.6}px ${p.size * 0.6}px ${p.color}44`,
                  animationDuration: `${p.dur}s, ${p.flutterDur * 4.2}s`,
                  animationDelay: `-${p.delay}s, -${p.flutterDelay}s`,
                  "--sf-wobble": `${p.sway}px`,
                  "--sf-drift": `${p.drift}px`,
                } as React.CSSProperties
              }
            />
          );
        }
        const g: SeasonGlyph = p.glyph < 0 ? PETAL_GLYPH : decor.glyphs[p.glyph]!;
        const filled = Boolean(g.paths?.length || g.circles?.length);
        return (
          // Two animations that must not share a transform: the outer span
          // DESCENDS - a straight linear drop plus the wind's sideways lean -
          // while the inner svg FLUTTERS, an ease-in-out pendulum of sway and
          // rock. Together they trace the lazy zigzag of a real falling leaf.
          // The first cut instead spun each piece like a pinwheel, which on
          // the wall read as glinting - leaves rock, they do not rotate.
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
                "--sf-fall": `${boxH + p.size * 3}px`,
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
                {g.paths?.map((d, j) => (
                  <path key={j} d={d} />
                ))}
                {g.circles?.map((c, j) => (
                  <circle key={j} cx={c.cx} cy={c.cy} r={c.r} />
                ))}
              </g>
              {g.detail ? <path d={g.detail} fill="none" stroke="currentColor" strokeWidth={filled ? 1.5 : 1.7} strokeLinecap="round" strokeLinejoin="round" /> : null}
              {g.veins ? <path d={g.veins} fill="none" stroke="rgb(0 0 0 / 0.38)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" /> : null}
            </svg>
          </span>
        );
      })}
    </div>
  );
}
