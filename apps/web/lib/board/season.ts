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
  /**
   * Stroked in the piece's OWN colour. For line drawing that leaves the
   * silhouette - a sun's rays, a tulip's stem, a snowflake entire. Drawing
   * these dark puts black lines on the board's dark ground and they vanish.
   */
  detail?: string;
  /**
   * Stroked DARK, and only ever on top of a fill - a leaf's veins, an acorn's
   * cap line. These must contrast with the shape they lie on, which the
   * piece's own colour cannot do.
   */
  veins?: string;
};

/**
 * Every glyph has to read in ONE colour, at about 40px, from across a room.
 * That rules out anything whose meaning lives in its colouring (a watermelon
 * slice is a half-disc in mono) and puts all the weight on silhouette. These
 * were redrawn on 2026-08-31 after the operator's children reported, correctly,
 * that the autumn leaves were not leaves.
 */

/** A simple leaf: asymmetric, with a stem. Nature is rarely a teardrop. */
const LEAF: SeasonGlyph = {
  name: "leaf",
  paths: [
    "M20.4 3.2c1 5.4-.6 9.6-3.6 12.1-2.8 2.3-6.4 2.6-8.8 1.3-.5 1.4-.8 2.9-.9 4.6H5.3c.2-2.4.7-4.5 1.5-6.3C4.4 11.6 4.9 7.2 7.6 5.1c3-2.4 8.1-2.4 12.8-1.9Z",
  ],
  veins: "M6.8 21.2C9.4 13.4 14 8.4 19.6 4.6M10.6 13.2l-.5-3.9M13.4 10.4l-.4-3.8M16 8.3l-.3-3.4M8.7 16.7l-.5-3.6",
};

/**
 * Eleven-point maple, as a plain polygon so the shape can be reasoned about
 * point by point. The first attempt was a spiky star - symmetric points
 * radiating from a centre, which is a sparkle, never a leaf. The second drew
 * its stem as a thin spike back up INTO the leaf, which left a notch through
 * the middle. A maple reads by three deep bays and one stem going down.
 */
const MAPLE: SeasonGlyph = {
  name: "maple",
  paths: [
    "M12 1.6 13.5 6.2 16.9 4.6 16.2 9 20.6 7.8 19.2 11 22.6 12.4 18.9 15.4 19.8 17.4 14.8 16.6 14.6 18.8 12.7 17.2 12.7 22.2 11.3 22.2 11.3 17.2 9.4 18.8 9.2 16.6 4.2 17.4 5.1 15.4 1.4 12.4 4.8 11 3.4 7.8 7.8 9 7.1 4.6 10.5 6.2Z",
  ],
};

/** Nut with a proper cap sitting ON it. The first one floated a bar above a disc. */
const ACORN: SeasonGlyph = {
  name: "acorn",
  paths: [
    "M12 22.4c-3.3 0-5.7-2.4-5.7-5.9 0-2.9 2-5.9 5.7-8.2 3.7 2.3 5.7 5.3 5.7 8.2 0 3.5-2.4 5.9-5.7 5.9Z",
    "M12 5.6c3.4 0 6.1 1.4 6.1 3.1 0 1.2-.9 1.9-2.2 1.9H8.1c-1.3 0-2.2-.7-2.2-1.9 0-1.7 2.7-3.1 6.1-3.1Z",
  ],
  detail: "M12 5.6V2.4",
  veins: "M7.4 8.4h9.2",
};

const SNOWFLAKE: SeasonGlyph = {
  name: "snowflake",
  detail:
    "M12 2v20M3.3 7l17.4 10M20.7 7 3.3 17M12 6.5 9.4 4M12 6.5 14.6 4M12 17.5 9.4 20M12 17.5l2.6 2.5M7.2 9.3 3.9 9M7.2 9.3 5.9 6.2M16.8 14.7l3.3.3M16.8 14.7l1.3 3.1M16.8 9.3l3.3-.3M16.8 9.3l1.3-3.1M7.2 14.7l-3.3.3M7.2 14.7l-1.3 3.1",
};

/** A fir with layered boughs rather than a single triangle on a stick. */
const PINE: SeasonGlyph = {
  name: "pine",
  paths: ["M12 1.6l3.6 5.2h-1.9l3.4 4.9h-1.9l4 5.7h-6.4V22h-1.6v-4.6H4.8l4-5.7H6.9l3.4-4.9H8.4L12 1.6Z"],
};

/**
 * Snowman, replacing holly. Holly went through two drafts and both came out as
 * a starburst: spines arranged around a centre read as a star no matter how
 * they are shaped, and the berries disappeared inside the spikes. A snowman is
 * three stacked circles - it cannot be mistaken for anything else in one
 * colour, and the children this decor is for will recognise it instantly.
 */
const SNOWMAN: SeasonGlyph = {
  name: "snowman",
  paths: ["M8.6 5.1h6.8v1.3H8.6zM10 1.9h4v3.2h-4z"],
  circles: [
    { cx: 12, cy: 9.4, r: 2.9 },
    { cx: 12, cy: 15, r: 3.6 },
    { cx: 12, cy: 20.2, r: 3.1 },
  ],
  veins: "M9.9 9h.1M14 9h.1M10.5 10.6c.9.7 2.1.7 3 0",
};

/** One loose petal, for spring's falling pieces - a soft comma of a shape. */
const PETAL: SeasonGlyph = {
  name: "petal",
  paths: ["M12 3.2c4.2 1.8 6.4 5.2 6.4 9.6 0 4.6-2.6 7.9-6.4 8-3.8-.1-6.4-3.4-6.4-8 0-4.4 2.2-7.8 6.4-9.6Z"],
  veins: "M12 19.2c-.4-4.6-.4-9.4 0-14.2",
};

/** Five petal circles at 72 degrees around the centre, plus a pistil. */
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

/**
 * Butterfly, replacing a five-petal blossom that came out green and read as
 * clover. The body is a dark vein rather than a filled shape, because in one
 * colour a filled body merges with the wings and the whole thing turns into a
 * bow.
 */
const BUTTERFLY: SeasonGlyph = {
  name: "butterfly",
  paths: [
    "M11.2 7.4C10 4.6 7.7 2.6 5.3 2.6 3.2 2.6 1.8 4.1 1.8 6.2c0 2.7 2.3 4.8 5.2 5.8-2.9 1-5.2 3.1-5.2 5.8 0 2.1 1.4 3.6 3.5 3.6 2.4 0 4.7-2 5.9-4.8V7.4Z",
    "M12.8 7.4c1.2-2.8 3.5-4.8 5.9-4.8 2.1 0 3.5 1.5 3.5 3.6 0 2.7-2.3 4.8-5.2 5.8 2.9 1 5.2 3.1 5.2 5.8 0 2.1-1.4 3.6-3.5 3.6-2.4 0-4.7-2-5.9-4.8V7.4Z",
  ],
  detail: "M11.4 6.2 9 2.6M12.6 6.2 15 2.6",
  veins: "M12 5.8v12.4",
};

export type SeasonDecor = {
  label: string;
  glyphs: SeasonGlyph[];
  /** Season-true colors. Deliberately NOT the theme accents — autumn leaves
   *  in a midnight-blue theme's accent read as confetti, not as leaves. */
  palette: string[];
};

export const SEASON_DECOR: Record<Season, SeasonDecor> = {
  fall: { label: "Autumn leaves", glyphs: [MAPLE, LEAF, ACORN], palette: ["#C2410C", "#B45309", "#D97706", "#92400E", "#A16207", "#DC2626"] },
  winter: { label: "Winter frost", glyphs: [SNOWFLAKE, PINE, SNOWMAN], palette: ["#E0F2FE", "#BAE6FD", "#7DD3FC", "#CBD5E1", "#F8FAFC", "#38BDF8"] },
  spring: { label: "Spring blossom", glyphs: [BLOSSOM, TULIP, LEAF], palette: ["#F9A8D4", "#FBCFE8", "#86EFAC", "#A7F3D0", "#FDE68A", "#F472B6"] },
  summer: { label: "Summer green", glyphs: [SUN, LEAF, BUTTERFLY], palette: ["#FACC15", "#4ADE80", "#22C55E", "#FDE047", "#FCD34D", "#A3E635"] },
};

/**
 * One falling piece of the season, inside the calendar card. The card is the
 * sky: a piece starts above the top edge, tumbles the full height, and loops.
 * All coordinates are in the card's own (zoomed) units.
 *
 * Summer is the exception: fireflies do not fall. A firefly piece keeps its
 * position and pulses instead - the renderer switches on `kind`.
 */
export type FallingPiece = {
  kind: "glyph" | "firefly";
  /** Index into the season's glyph list; -1 is spring's loose petal. */
  glyph: number;
  x: number;
  /** Fireflies only: resting y position. Fallers start above the card. */
  y: number;
  size: number;
  color: string;
  opacity: number;
  /** Seconds for one full traverse (fall) or one wander cycle (firefly). */
  dur: number;
  /** Negative start offset, so the sky is already busy on first paint. */
  delay: number;
  /**
   * Wind: total sideways displacement over one traverse, px. Every faller in
   * a card shares the wind's SIGN, so the whole sky leans one way - that is
   * what makes it read as a breeze instead of particles.
   */
  drift: number;
  /** The pendulum: sideways sway amplitude (px) and rocking angle (deg). */
  sway: number;
  rock: number;
  /** One half-swing of the pendulum, seconds, with its own start offset. */
  flutterDur: number;
  flutterDelay: number;
};

/** Deterministic PRNG - the same card must animate identically on every
 *  render, or the 5-minute refresh would teleport every leaf mid-fall. */
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
 * Per-season physics. Numbers are the operator's picks (2026-08-31): BIG
 * leaves - 45-75px is most of an inch on the glass - carried on a steady
 * gentle breeze, rocking side to side, NEVER spinning like a pinwheel. The
 * first cut spun each piece 360-720 degrees per fall, and on the wall that
 * flat rotation read as glinting ("they are shining"). Real leaves rock.
 */
const FALL_PHYSICS: Record<Exclude<Season, "summer">, {
  count: [number, number];
  size: [number, number];
  dur: [number, number];
  rock: [number, number];
  sway: [number, number];
}> = {
  // Few, large, unhurried: statement leaves.
  fall: { count: [7, 9], size: [45, 75], dur: [35, 60], rock: [22, 38], sway: [14, 30] },
  // More and smaller - a flurry is many flakes, and a 75px snowflake is a prop.
  winter: { count: [12, 16], size: [24, 44], dur: [40, 70], rock: [8, 16], sway: [18, 40] },
  // Petals are light: quicker pendulum, gentler size.
  spring: { count: [10, 13], size: [24, 42], dur: [30, 55], rock: [16, 28], sway: [12, 26] },
};

const between = (rand: () => number, [a, b]: [number, number]) => a + rand() * (b - a);

/**
 * The season falling through a card of w x h (the card's own units).
 * Fall/winter/spring drop their glyphs on slow wind-blown pendulums; summer
 * scatters fireflies that stay put and glow.
 */
export function seasonalFall(season: Season, w: number, h: number): FallingPiece[] {
  const decor = SEASON_DECOR[season];
  const rand = rng(seedOf(season, w, h));
  const pieces: FallingPiece[] = [];

  if (season === "summer") {
    const n = Math.max(8, Math.min(16, Math.round((w * h) / 52_000)));
    for (let i = 0; i < n; i++) {
      pieces.push({
        kind: "firefly",
        glyph: 0,
        x: Math.round(w * (0.04 + rand() * 0.92)),
        y: Math.round(h * (0.12 + rand() * 0.8)),
        size: Math.round(5 + rand() * 4),
        color: rand() < 0.7 ? "#FFE28A" : "#D9F99D",
        opacity: 1, // the pulse animation owns the opacity
        dur: +(2.6 + rand() * 3.4).toFixed(1),
        delay: +(rand() * 6).toFixed(1),
        drift: Math.round((rand() - 0.5) * 30),
        sway: Math.round(8 + rand() * 18),
        rock: 0,
        flutterDur: +(4 + rand() * 4).toFixed(1),
        flutterDelay: +(rand() * 4).toFixed(1),
      });
    }
    return pieces;
  }

  const phys = FALL_PHYSICS[season];
  // One wind per card: every leaf leans the same way. Seeded, so the wind
  // holds its direction across refreshes instead of gusting at random.
  const windSign = rand() < 0.5 ? -1 : 1;
  const n = Math.round(between(rand, phys.count));
  for (let i = 0; i < n; i++) {
    const glyph = season === "spring" && rand() < 0.8 ? -1 : Math.floor(rand() * decor.glyphs.length);
    pieces.push({
      kind: "glyph",
      glyph,
      x: Math.round(w * (0.02 + rand() * 0.96)),
      y: 0,
      size: Math.round(between(rand, phys.size)),
      color: decor.palette[Math.floor(rand() * decor.palette.length)]!,
      opacity: +(0.4 + rand() * 0.2).toFixed(2),
      dur: +between(rand, phys.dur).toFixed(1),
      delay: +(rand() * 60).toFixed(1),
      drift: Math.round(windSign * (30 + rand() * 90)),
      sway: Math.round(between(rand, phys.sway)),
      rock: Math.round(between(rand, phys.rock)),
      flutterDur: +(2.8 + rand() * 3).toFixed(1),
      flutterDelay: +(rand() * 5).toFixed(1),
    });
  }
  return pieces;
}

/** Spring's loose petal, exported for the renderer's glyph = -1 case. */
export const PETAL_GLYPH: SeasonGlyph = PETAL;
