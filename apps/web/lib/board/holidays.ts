/**
 * US holiday decor — near a holiday, the calendar card's ambient pieces switch
 * from the season's set (see season.ts) to the holiday's: pumpkins before
 * Halloween, hearts before Valentine's, and so on.
 *
 * Pure data + pure date arithmetic, no server-only imports, so it can be
 * unit-tested and the renderer stays a dumb server component. Dates are
 * computed in local time because a wall display lives in one kitchen: the
 * question "is it nearly Halloween?" is asked in the household's own clock,
 * never UTC.
 *
 * The glyphs follow the hard-won rules from season.ts: one colour, silhouette
 * carries all the meaning, `detail` strokes in the piece's own colour and may
 * leave the shape, `veins` stroke dark and only ever sit ON a fill. Every
 * shape below was rendered to a specimen sheet and looked at before shipping;
 * do not add a glyph here without doing the same.
 */

import type { SeasonGlyph } from "./season";

export type Holiday = {
  id: string;
  label: string;
  glyphs: SeasonGlyph[];
  /** Holiday-true colours, 4-6 hexes. Like the season palettes these are
   *  deliberately NOT the theme accents — a heart is only a heart in reds. */
  palette: string[];
  /** Inclusive day-window this year: local midnight at the start through the
   *  last millisecond of the holiday itself. */
  window: (year: number) => { start: Date; end: Date };
};

/* ------------------------------------------------------------------ dates */

function startOfDay(year: number, month: number, day: number): Date {
  // Date rolls negative days into the previous month (and year), which is
  // exactly what a "3 days before January 1st" window needs.
  return new Date(year, month, day);
}

function endOfDay(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 23, 59, 59, 999);
}

/**
 * The day-of-month of the nth given weekday (0 = Sunday) in a month. "Fourth
 * Thursday of November" is how Thanksgiving is defined in law, so we compute
 * it the same way rather than tabulating years.
 */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(year, month, 1).getDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}

/**
 * Easter Sunday by the anonymous Gregorian computus (the Meeus/Jones/Butcher
 * form). It looks like numerology because it is: the intermediate values track
 * the lunar cycle against the Gregorian leap rules. Implemented rather than
 * tabulated so the display keeps working in years nobody thought to enter;
 * verified in the tests against four known dates.
 */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** A window of `lead` days before a fixed date through the end of the day
 *  itself. Negative day-of-month rollover handles windows that start in the
 *  previous month — or, for New Year's, the previous year. */
function windowBefore(month: number, day: number, lead: number): Holiday["window"] {
  return (year) => ({ start: startOfDay(year, month, day - lead), end: endOfDay(year, month, day) });
}

/* ----------------------------------------------------------------- glyphs */

/**
 * A four-point sparkle with two companion glints — the flash of midnight, not
 * a star in the sky. Concave sides are what read "sparkle" rather than
 * "badge"; season.ts learned the inverse lesson when a spiky maple kept
 * reading as a sparkle.
 */
const SPARKLE: SeasonGlyph = {
  name: "sparkle",
  paths: [
    "M12 1.8c.8 5.2 3.2 8.4 8.7 10.2-5.5 1.8-7.9 5-8.7 10.2-.8-5.2-3.2-8.4-8.7-10.2 5.5-1.8 7.9-5 8.7-10.2Z",
  ],
  circles: [
    { cx: 19.6, cy: 4.4, r: 1.2 },
    { cx: 4.6, cy: 19.4, r: 1 },
  ],
};

/** A party balloon: teardrop body, a little knot, and a string that wanders
 *  off the silhouette (own-colour detail, so it survives the dark ground). */
const BALLOON: SeasonGlyph = {
  name: "balloon",
  paths: [
    "M12 1.8c3.7 0 6.4 3 6.4 7.1 0 4.4-2.9 8.1-6.4 8.1s-6.4-3.7-6.4-8.1c0-4.1 2.7-7.1 6.4-7.1Z",
    "M12 16.6l1.9 2.5h-3.8Z",
  ],
  detail: "M12 19.1c-1.7 1.2-1.7 2.7.2 3.9",
};

/** The classic two-lobe heart. Nothing to iterate: this shape is a phoneme. */
const HEART: SeasonGlyph = {
  name: "heart",
  paths: [
    "M12 21.4C6 17 2.4 13 2.4 8.8 2.4 5.6 4.8 3.2 7.8 3.2c1.7 0 3.3.8 4.2 2.2.9-1.4 2.5-2.2 4.2-2.2 3 0 5.4 2.4 5.4 5.6 0 4.2-3.6 8.2-9.6 12.6Z",
  ],
};

/** The same heart run through with an arrow. The arrow is own-colour detail:
 *  it must leave the silhouette on both sides or it reads as a scratch. */
const HEART_ARROW: SeasonGlyph = {
  name: "heart-arrow",
  paths: [
    "M12.6 20.2c-4.9-3.6-7.8-6.9-7.8-10.3 0-2.6 2-4.6 4.4-4.6 1.4 0 2.7.7 3.4 1.8.7-1.1 2-1.8 3.4-1.8 2.4 0 4.4 2 4.4 4.6 0 3.4-2.9 6.7-7.8 10.3Z",
  ],
  detail: "M2.2 21.8 20.6 3.4M20.6 3.4l-4.6.7M20.6 3.4l-.7 4.6M5.5 21.1l-2.4-.7M2.9 18.5l.7 2.4",
};

/** A football lying on its side: the pointed-oval silhouette, with the lacing
 *  as dark veins because the laces have to contrast with the leather. */
const FOOTBALL: SeasonGlyph = {
  name: "football",
  paths: [
    "M12 5.4c4.8 0 8.8 2.8 10.5 6.6-1.7 3.8-5.7 6.6-10.5 6.6S3.2 15.8 1.5 12C3.2 8.2 7.2 5.4 12 5.4Z",
  ],
  veins: "M8.4 12h7.2M9.6 10.4v3.2M12 10.4v3.2M14.4 10.4v3.2",
};

/** Goalposts, drawn entirely in own-colour line like the snowflake: crossbar,
 *  two uprights, post, base. A filled version is just a letter H. */
const GOALPOST: SeasonGlyph = {
  name: "goalpost",
  detail: "M4.5 3v9.5M19.5 3v9.5M4.5 12.5h15M12 12.5V22M8.5 22h7",
};

/** A game-day pennant streaming from its pole. */
const PENNANT: SeasonGlyph = {
  name: "pennant",
  paths: ["M6.4 3.8 21.8 8.6 6.4 13.4Z"],
  detail: "M5.3 2.6v18.8",
};

/**
 * A shamrock as three overlapping leaf-discs and a curved stem. season.ts
 * records that a cluster of green circles kept getting read as clover when a
 * blossom was wanted — here that failure mode is exactly the target.
 */
const SHAMROCK: SeasonGlyph = {
  name: "shamrock",
  circles: [
    { cx: 12, cy: 6.3, r: 4.2 },
    { cx: 7.9, cy: 13.4, r: 4.2 },
    { cx: 16.1, cy: 13.4, r: 4.2 },
  ],
  detail: "M12.4 15.2c1 2.6.8 4.8-1.6 7",
};

/** A lucky horseshoe, heels up the way you hang one so the luck stays in.
 *  The nail holes are dark dot-veins on the iron. */
const HORSESHOE: SeasonGlyph = {
  name: "horseshoe",
  paths: ["M4 4.6h4.4V8a3.6 4 0 0 0 7.2 0V4.6H20v4.6a8 8.6 0 0 1-16 0Z"],
  veins: "M6.4 12.4h.1M8.4 16.2h.1M12 17.8h.1M15.6 16.2h.1M17.6 12.4h.1",
};

/** A decorated egg: the silhouette is the egg, the decoration is one zigzag
 *  band of dark veins — any more banding turns to noise at 40px. */
const EGG: SeasonGlyph = {
  name: "egg",
  paths: [
    "M12 2.4c4 0 7 4.7 7 10.1 0 5.3-3 9.1-7 9.1s-7-3.8-7-9.1c0-5.4 3-10.1 7-10.1Z",
  ],
  veins: "M5.4 13.2 7.6 11.3l2.2 1.9 2.2-1.9 2.2 1.9 2.2-1.9 2.2 1.9",
};

/** A rabbit head: round face, two long ears. In one colour the ears do all
 *  the talking — the first draft's stubby ears made a gummy bear, so these
 *  run nearly half the box tall and lean apart. */
const BUNNY: SeasonGlyph = {
  name: "bunny",
  paths: [
    "M7.6 12.4C5.6 9.2 5.3 4.3 6.9 1.8c.6-1 1.8-1 2.4 0 1.5 2.6 1.7 7.5.4 10.9Z",
    "M16.4 12.4c2-3.2 2.3-8.1.7-10.6-.6-1-1.8-1-2.4 0-1.5 2.6-1.7 7.5-.4 10.9Z",
  ],
  circles: [{ cx: 12, cy: 16, r: 5.7 }],
  veins: "M9.8 14.8h.1M14.2 14.8h.1M12 17v1M12 18l-.9.8M12 18l.9.8",
};

/** A firework burst: rays and spark-dots around an empty centre. Own-colour
 *  line throughout — a filled burst is a splat. */
const FIREWORK: SeasonGlyph = {
  name: "firework",
  circles: [
    { cx: 12, cy: 12, r: 1.4 },
    { cx: 22.6, cy: 12, r: 0.9 },
    { cx: 19.5, cy: 4.5, r: 0.9 },
    { cx: 12, cy: 1.4, r: 0.9 },
    { cx: 4.5, cy: 4.5, r: 0.9 },
    { cx: 1.4, cy: 12, r: 0.9 },
    { cx: 4.5, cy: 19.5, r: 0.9 },
    { cx: 12, cy: 22.6, r: 0.9 },
    { cx: 19.5, cy: 19.5, r: 0.9 },
  ],
  detail:
    "M15 12h5.6M14.1 9.9l4-4M12 9V3.4M9.9 9.9l-4-4M9 12H3.4M9.9 14.1l-4 4M12 15v5.6M14.1 14.1l4 4",
};

/** A five-point star, points computed at 72-degree steps so it sits straight. */
const STAR5: SeasonGlyph = {
  name: "star",
  paths: [
    "M12 2.4 14.59 9.24 21.89 9.59 16.18 14.16 18.11 21.21 12 17.2 5.89 21.21 7.82 14.16 2.11 9.59 9.41 9.24Z",
  ],
};

/** A plain pumpkin: squat body, stout stem, ribs as dark veins. */
const PUMPKIN: SeasonGlyph = {
  name: "pumpkin",
  paths: [
    "M12 6c5.9 0 9.6 3.4 9.6 8 0 4.6-3.7 7.7-9.6 7.7S2.4 18.6 2.4 14c0-4.6 3.7-8 9.6-8Z",
    "M11 6.4c-.2-2 .3-3.6 1.5-4.9l2 1c-1 1.2-1.4 2.4-1.3 3.9Z",
  ],
  veins: "M8.2 6.9c-1.7 2.1-1.7 12.1 0 14.2M15.8 6.9c1.7 2.1 1.7 12.1 0 14.2M12 6.2v15.4",
};

/**
 * The jack-o'-lantern: the pumpkin again, but the ribs give way to a face.
 * The cut-outs are drawn as small closed vein-triangles — at 40px the 1.4
 * stroke almost fills them, which is as close to "cut out dark" as this
 * one-fill system gets, and it reads.
 */
const JACKO: SeasonGlyph = {
  name: "jack-o-lantern",
  paths: [
    "M12 6c5.9 0 9.6 3.4 9.6 8 0 4.6-3.7 7.7-9.6 7.7S2.4 18.6 2.4 14c0-4.6 3.7-8 9.6-8Z",
    "M11 6.4c-.2-2 .3-3.6 1.5-4.9l2 1c-1 1.2-1.4 2.4-1.3 3.9Z",
  ],
  veins:
    "M8 10 10.2 13.5H5.8ZM16 10l2.2 3.5h-4.4ZM12 13.4l1 1.7h-2ZM6.2 16.4l1.9 1.9 1.9-1.9 2 1.9 2-1.9 1.9 1.9 1.9-1.9",
};

/** A ghost: dome head, wavy hem, two dot eyes. The hem scallops are cut
 *  deep — a shallow wave reads as a hooded figure, not a ghost. */
const GHOST: SeasonGlyph = {
  name: "ghost",
  paths: [
    "M12 2.6c4.7 0 8.1 3.6 8.1 8.6v10.2l-2.7-2.9-2.7 2.9-2.7-2.9-2.7 2.9-2.7-2.9-2.7 2.9V11.2c0-5 3.4-8.6 8.1-8.6Z",
  ],
  veins: "M9.4 10h.1M14.6 10h.1M11 13.3c.6.5 1.4.5 2 0",
};

/** A bat: two pointed ears on a small head, wings out to sharp tips, and a
 *  hanging membrane whose lower edge sags in scallops down to a low center
 *  body. The first draft's wings ran level and the whole thing read as a
 *  moustache; the bat lives in the droop. */
const BAT: SeasonGlyph = {
  name: "bat",
  paths: [
    "M1.2 8.6C4 6.2 7 5.8 9.4 6.8L9.6 3.2 11.2 6Q12 5.5 12.8 6L14.4 3.2 14.6 6.8C17 5.8 20 6.2 22.8 8.6Q21.2 10.6 18.6 14.2Q16.5 13.8 14.6 15.8Q13.1 15.5 12 16.8Q10.9 15.5 9.4 15.8Q7.5 13.8 5.4 14.2Q2.8 10.6 1.2 8.6Z",
  ],
};

/**
 * The turkey, drawn the way a child draws one: a scalloped tail fan, a round
 * body, and a head rising through the notch at the top of the fan. Earlier
 * drafts placed a side-view head next to a fan of discs and the fills merged
 * into a poodle — with one colour, anything inside the union outline simply
 * does not exist, so the head has to poke OUT of the silhouette. Feather
 * separations are dark vein rays; the face is dark veins on the head.
 */
const TURKEY: SeasonGlyph = {
  name: "turkey",
  paths: [
    // Tail fan: four scallop arcs over a half-disc, notched at top center.
    "M4.8 15A3.2 3.2 0 0 1 6.91 9.91 3.2 3.2 0 0 1 12 7.8 3.2 3.2 0 0 1 17.09 9.91 3.2 3.2 0 0 1 19.2 15Z",
    // Head and neck: a capsule through the fan's top notch, ending clear of it.
    "M10.2 16V6.4a1.8 1.8 0 0 1 3.6 0V16Z",
  ],
  circles: [{ cx: 12, cy: 17.3, r: 4.9 }],
  veins: "M11.2 6.2h.1M12.8 6.2h.1M11.3 7.5h1.4l-.7 1.1ZM12 8.8c0 1-.3 1.9-.9 2.6M10.4 12.9 6.6 11.4M11.5 11.6 10.2 8.9M12.5 11.6l1.3-2.7M13.6 12.9l3.8-1.5",
};

/** A pilgrim hat: wide brim, tall tapered crown, buckle band as dark veins. */
const PILGRIM_HAT: SeasonGlyph = {
  name: "pilgrim-hat",
  paths: [
    "M3.4 17.8h17.2v2.8H3.4Z",
    "M6.9 17.8 8 6.4h8l1.1 11.4Z",
  ],
  veins: "M7.4 14.4h9.2M10.9 12.2h2.2v2.2h-2.2Z",
};

/** A gift box: lid wider than the box so the silhouette steps, ribbon as a
 *  dark vein down the middle, bow loops in own-colour detail on top. */
const GIFT: SeasonGlyph = {
  name: "gift",
  paths: [
    "M5 11.4h14v9.8H5Z",
    "M3.8 7.2h16.4v4.2H3.8Z",
  ],
  detail: "M12 7c-1.2-2.4-3.2-3.3-4.5-2.3-1.4 1.1-.5 2.5 4.5 2.3m0 0c1.2-2.4 3.2-3.3 4.5-2.3 1.4 1.1.5 2.5-4.5 2.3",
  veins: "M12 7.4v13.4",
};

/** A candy cane: filled J-hook silhouette with diagonal stripe veins. A
 *  stroked-line cane came out looking like a fishhook, so the tube is a fill. */
const CANDY_CANE: SeasonGlyph = {
  name: "candy-cane",
  paths: [
    "M10.3 21.6V10.4c0-2.3-1.4-3.7-3.1-3.7-1.5 0-2.6 1-3 2.5l-2.5-.8c.7-2.8 3-4.8 5.8-4.8 3.4 0 6.4 2.7 6.4 6.8v11.2Z",
  ],
  veins: "M10.3 18.6 13.9 17.4M10.3 14.6 13.9 13.4M10.5 10.7l3.3-1.5M8.9 7 10.9 4.4M5.3 6.7 4.3 4.3",
};

/** A tree ornament: ball, cap, hanger loop, one decorative band. season.ts
 *  already has the tree itself (PINE) — the renderer can mix that in. */
const ORNAMENT: SeasonGlyph = {
  name: "ornament",
  paths: ["M10.3 4h3.4v2.4h-3.4Z"],
  circles: [{ cx: 12, cy: 13.9, r: 7.4 }],
  detail: "M12 4c0-1.3.8-2 1.8-1.8",
  veins: "M5.2 12.4c4.4-1.6 9.2-1.6 13.6 0M5.2 15.4c4.4 1.6 9.2 1.6 13.6 0",
};

/* --------------------------------------------------------------- holidays */

/**
 * Calendar order. Windows are "N days before through the day itself" — long
 * enough to feel anticipatory, short enough that the season still gets its
 * turn. Christmas deliberately owns all of December 1-25 because Advent is
 * the anticipation; New Year's takes just Dec 29 - Jan 1 so the tree decor
 * isn't still up in the second week of January.
 */
export const HOLIDAYS: Holiday[] = [
  {
    id: "new-years",
    label: "New Year's Day",
    glyphs: [SPARKLE, BALLOON, STAR5],
    palette: ["#FDE047", "#FACC15", "#F8FAFC", "#CBD5E1", "#C4B5FD", "#F0ABFC"],
    // Jan 1 minus 3 days rolls back into December of the previous year.
    window: windowBefore(0, 1, 3),
  },
  {
    id: "super-bowl",
    label: "Super Bowl Sunday",
    glyphs: [FOOTBALL, GOALPOST, PENNANT],
    palette: ["#92400E", "#B45309", "#22C55E", "#4ADE80", "#F8FAFC", "#FACC15"],
    window: (year) => {
      const day = nthWeekday(year, 1, 0, 2); // second Sunday of February
      return { start: startOfDay(year, 1, day - 5), end: endOfDay(year, 1, day) };
    },
  },
  {
    id: "valentines",
    label: "Valentine's Day",
    glyphs: [HEART, HEART_ARROW],
    palette: ["#F43F5E", "#FB7185", "#F9A8D4", "#E11D48", "#FDA4AF", "#F472B6"],
    window: windowBefore(1, 14, 7),
  },
  {
    id: "st-patricks",
    label: "St. Patrick's Day",
    glyphs: [SHAMROCK, HORSESHOE],
    palette: ["#15803D", "#16A34A", "#22C55E", "#4ADE80", "#86EFAC", "#FACC15"],
    window: windowBefore(2, 17, 7),
  },
  {
    id: "easter",
    label: "Easter",
    glyphs: [EGG, BUNNY],
    palette: ["#F9A8D4", "#A7F3D0", "#FDE68A", "#C4B5FD", "#BAE6FD", "#FBCFE8"],
    window: (year) => {
      const easter = easterSunday(year);
      const m = easter.getMonth();
      const d = easter.getDate();
      return { start: startOfDay(year, m, d - 7), end: endOfDay(year, m, d) };
    },
  },
  {
    id: "independence-day",
    label: "Independence Day",
    glyphs: [FIREWORK, STAR5],
    palette: ["#EF4444", "#F8FAFC", "#60A5FA", "#3B82F6", "#FCA5A5", "#BFDBFE"],
    window: windowBefore(6, 4, 7),
  },
  {
    id: "halloween",
    label: "Halloween",
    glyphs: [PUMPKIN, JACKO, GHOST, BAT],
    palette: ["#F97316", "#FB923C", "#A855F7", "#84CC16", "#FDBA74", "#C2410C"],
    window: windowBefore(9, 31, 14),
  },
  {
    id: "thanksgiving",
    label: "Thanksgiving",
    // The autumn leaf already falls all November from season.ts, so the
    // holiday set stays purely Thanksgiving: no leaf duplicate here.
    glyphs: [TURKEY, PILGRIM_HAT, PUMPKIN],
    palette: ["#B45309", "#C2410C", "#D97706", "#92400E", "#DC2626", "#A16207"],
    window: (year) => {
      const day = nthWeekday(year, 10, 4, 4); // fourth Thursday of November
      return { start: startOfDay(year, 10, day - 10), end: endOfDay(year, 10, day) };
    },
  },
  {
    id: "christmas",
    label: "Christmas",
    glyphs: [GIFT, CANDY_CANE, ORNAMENT],
    palette: ["#DC2626", "#16A34A", "#FACC15", "#F8FAFC", "#EF4444", "#22C55E"],
    window: windowBefore(11, 25, 24), // all of Advent: Dec 1-25
  },
];

/**
 * The holiday whose window contains `d`, or null on an ordinary day. When
 * windows overlap (Super Bowl lead-up inside Valentine's week, every
 * February), the one that ENDS soonest wins: the nearer holiday is the one
 * the household is actually anticipating, and the loser gets the stage back
 * the moment the winner's day has passed. Ties go to calendar order.
 *
 * A date in late December sits inside NEXT year's New Year window, so each
 * holiday is checked against this year's window and next year's.
 */
export function activeHoliday(d: Date): Holiday | null {
  const t = d.getTime();
  let best: Holiday | null = null;
  let bestEnd = Infinity;
  for (const h of HOLIDAYS) {
    for (const year of [d.getFullYear(), d.getFullYear() + 1]) {
      const { start, end } = h.window(year);
      if (t >= start.getTime() && t <= end.getTime() && end.getTime() < bestEnd) {
        best = h;
        bestEnd = end.getTime();
      }
    }
  }
  return best;
}
