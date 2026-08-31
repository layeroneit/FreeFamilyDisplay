/**
 * Seasonal edge decor — leaves in autumn, snowflakes in winter, blossom in
 * spring, sun and green in summer, scattered down the four edges of the board
 * behind the widgets.
 *
 * Pure data + pure geometry so it can be unit-tested and so the renderer
 * stays a dumb server component. Northern-hemisphere months: this is a
 * household wall display, not an almanac, and a family in one house is in one
 * hemisphere. Meteorological seasons (whole months) rather than astronomical
 * ones, because "autumn starts September 1st" is what a calendar on a kitchen
 * wall means by autumn.
 */

export type Season = "spring" | "summer" | "fall" | "winter";

export const SEASONS: readonly Season[] = ["spring", "summer", "fall", "winter"];

export function isSeason(v: string): v is Season {
  return (SEASONS as readonly string[]).includes(v);
}

/** Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov fall. */
export function seasonFor(d: Date): Season {
  const m = d.getMonth();
  if (m <= 1 || m === 11) return "winter";
  if (m <= 4) return "spring";
  if (m <= 7) return "summer";
  return "fall";
}

/**
 * One decorative shape, drawn in a 0 0 24 24 box. Filled paths and circles
 * carry the silhouette; `detail` is stroked over the top (a leaf's midrib,
 * a snowflake's spokes) at reduced opacity.
 */
export type SeasonGlyph = {
  name: string;
  paths?: string[];
  circles?: { cx: number; cy: number; r: number }[];
  detail?: string;
};

const LEAF: SeasonGlyph = {
  name: "leaf",
  paths: ["M12 2.2c5.1 4.1 7.7 8 7.7 11.8A7.7 7.7 0 0 1 4.3 14C4.3 10.2 6.9 6.3 12 2.2Z"],
  detail: "M12 21.6V6.4M12 11.6 8.4 8.9M12 11.6l3.6-2.7M12 15.9l-3.2-2.4M12 15.9l3.2-2.4",
};

const MAPLE: SeasonGlyph = {
  name: "maple",
  paths: [
    "M12 1.6l2.4 4.3 2.6-.9-.7 2.8 4.1-.6-2.7 3.2 3.2 1.3-3.6 2 1.6 2.5-4.4-.5.3 2.7L12 17l-3.8 2.4.3-2.7-4.4.5 1.6-2.5-3.6-2 3.2-1.3L2.6 7.2l4.1.6-.7-2.8 2.6.9L12 1.6Z",
  ],
  detail: "M12 22.4V9.5",
};

const ACORN: SeasonGlyph = {
  name: "acorn",
  paths: [
    "M12 22c-3.3 0-5.6-2.4-5.6-5.6 0-2.8 2-5.4 5.6-7.4 3.6 2 5.6 4.6 5.6 7.4C17.6 19.6 15.3 22 12 22Z",
    "M5.8 9.4h12.4a1.5 1.5 0 0 0 0-3H5.8a1.5 1.5 0 0 0 0 3Z",
  ],
  detail: "M12 6.4V3.2",
};

const SNOWFLAKE: SeasonGlyph = {
  name: "snowflake",
  detail:
    "M12 2v20M3.3 7l17.4 10M20.7 7 3.3 17M12 6.5 9.4 4M12 6.5 14.6 4M12 17.5 9.4 20M12 17.5l2.6 2.5M7.2 9.3 3.9 9M7.2 9.3 5.9 6.2M16.8 14.7l3.3.3M16.8 14.7l1.3 3.1M16.8 9.3l3.3-.3M16.8 9.3l1.3-3.1M7.2 14.7l-3.3.3M7.2 14.7l-1.3 3.1",
};

const PINE: SeasonGlyph = {
  name: "pine",
  paths: ["M12 2 7.5 9.5h2.6L6 16.5h4.6V22h2.8v-5.5H18l-4.1-7h2.6L12 2Z"],
};

const HOLLY: SeasonGlyph = {
  name: "holly",
  paths: [
    "M12 1.6c1.6 1.4 2 2.9 1.6 4.4 1.5-.5 3-.2 4.4 1-1.7.6-2.6 1.6-2.9 3 1.6.1 2.8.9 3.6 2.4-1.8.2-3 .8-3.7 2 1.3.9 2 2.2 2 3.9-1.9-.7-3.4-.6-4.5.4-.2-1.6-.7-2.7-1.6-3.4-.9.7-1.4 1.8-1.6 3.4-1.1-1-2.6-1.1-4.5-.4 0-1.7.7-3 2-3.9-.7-1.2-1.9-1.8-3.7-2 .8-1.5 2-2.3 3.6-2.4-.3-1.4-1.2-2.4-2.9-3 1.4-1.2 2.9-1.5 4.4-1C10 4.5 10.4 3 12 1.6Z",
  ],
  circles: [{ cx: 9.6, cy: 20.4, r: 1.7 }, { cx: 13.2, cy: 21.2, r: 1.7 }, { cx: 12.4, cy: 17.6, r: 1.7 }],
};

/** Five petal circles at 72° around the centre, plus a pistil. */
const BLOSSOM: SeasonGlyph = {
  name: "blossom",
  circles: [
    { cx: 12, cy: 7.6, r: 3 },
    { cx: 16.18, cy: 10.64, r: 3 },
    { cx: 14.59, cy: 15.56, r: 3 },
    { cx: 9.41, cy: 15.56, r: 3 },
    { cx: 7.82, cy: 10.64, r: 3 },
    { cx: 12, cy: 12, r: 2 },
  ],
};

const TULIP: SeasonGlyph = {
  name: "tulip",
  paths: ["M12 13.5c-2.6 0-4.6-2.4-4.6-5.6 0-1.3.3-2.5.8-3.5l1.6 2.4L12 3.2l2.2 3.6 1.6-2.4c.5 1 .8 2.2.8 3.5 0 3.2-2 5.6-4.6 5.6Z"],
  detail: "M12 13.5V22M12 18c-1.9 0-3.4-1.5-3.4-3.4M12 18c1.9 0 3.4-1.5 3.4-3.4",
};

const SUN: SeasonGlyph = {
  name: "sun",
  circles: [{ cx: 12, cy: 12, r: 5 }],
  detail: "M12 1.4v3.2M12 19.4v3.2M1.4 12h3.2M19.4 12h3.2M4.5 4.5l2.2 2.2M17.3 17.3l2.2 2.2M19.5 4.5l-2.2 2.2M6.7 17.3l-2.2 2.2",
};

export type SeasonDecor = {
  label: string;
  glyphs: SeasonGlyph[];
  /** Season-true colors. Deliberately NOT the theme accents — autumn leaves
   *  in a midnight-blue theme's accent read as confetti, not as leaves. */
  palette: string[];
};

export const SEASON_DECOR: Record<Season, SeasonDecor> = {
  fall: { label: "Autumn leaves", glyphs: [LEAF, MAPLE, ACORN], palette: ["#C2410C", "#B45309", "#D97706", "#92400E", "#A16207", "#DC2626"] },
  winter: { label: "Winter frost", glyphs: [SNOWFLAKE, PINE, HOLLY], palette: ["#E0F2FE", "#BAE6FD", "#7DD3FC", "#CBD5E1", "#F8FAFC", "#38BDF8"] },
  spring: { label: "Spring blossom", glyphs: [BLOSSOM, TULIP, LEAF], palette: ["#F9A8D4", "#FBCFE8", "#86EFAC", "#A7F3D0", "#FDE68A", "#F472B6"] },
  summer: { label: "Summer green", glyphs: [SUN, LEAF, BLOSSOM], palette: ["#FACC15", "#4ADE80", "#22C55E", "#FDE047", "#FCD34D", "#A3E635"] },
};

/** One placed piece of decor, in canvas pixels. */
export type FramePiece = {
  x: number;
  y: number;
  /** Box side in px; the glyph's 24-unit grid is scaled to it. */
  size: number;
  rot: number;
  /** Index into the season's glyph list. */
  glyph: number;
  color: string;
  opacity: number;
  /** Sway animation duration (s) and negative start offset (s). */
  dur: number;
  delay: number;
};

/** Deterministic PRNG — the same board must lay out identically on every
 *  render, or the 5-minute refresh would teleport every leaf. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function seedOf(season: Season, w: number, h: number): number {
  let s = w * 31 + h * 17;
  for (const ch of season) s = (s * 33 + ch.charCodeAt(0)) >>> 0;
  return s;
}

/**
 * Scatters decor down all four edges of a canvas, inset from the corners so
 * nothing clusters there, and never further in than `band` — the widgets own
 * the middle of the board and must not be sat on.
 */
export function seasonalFrame(season: Season, w: number, h: number): FramePiece[] {
  const decor = SEASON_DECOR[season];
  const rand = rng(seedOf(season, w, h));
  const band = Math.round(Math.min(w, h) * 0.075);
  const pieces: FramePiece[] = [];

  const place = (n: number, at: (t: number, jitter: number) => { x: number; y: number }) => {
    for (let i = 0; i < n; i++) {
      // Evenly spaced along the edge, inset 6% at each end, jittered a little
      // so it reads as scattered rather than as a ruler of stamps.
      const t = 0.06 + (0.88 * (i + 0.5)) / n + (rand() - 0.5) * (0.5 / n);
      const { x, y } = at(t, rand());
      const size = Math.round(band * (0.62 + rand() * 0.5));
      pieces.push({
        x: Math.round(x - size / 2),
        y: Math.round(y - size / 2),
        size,
        rot: Math.round(rand() * 360),
        glyph: Math.floor(rand() * decor.glyphs.length),
        color: decor.palette[Math.floor(rand() * decor.palette.length)]!,
        opacity: +(0.34 + rand() * 0.26).toFixed(2),
        dur: +(9 + rand() * 9).toFixed(1),
        delay: +(rand() * 12).toFixed(1),
      });
    }
  };

  const down = Math.max(3, Math.round(h / 190));
  const across = Math.max(3, Math.round(w / 240));
  place(down, (t, j) => ({ x: band * (0.28 + j * 0.5), y: h * t }));
  place(down, (t, j) => ({ x: w - band * (0.28 + j * 0.5), y: h * t }));
  place(across, (t, j) => ({ x: w * t, y: band * (0.28 + j * 0.5) }));
  place(across, (t, j) => ({ x: w * t, y: h - band * (0.28 + j * 0.5) }));
  return pieces;
}
