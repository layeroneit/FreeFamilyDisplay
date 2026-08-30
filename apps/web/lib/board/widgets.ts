/**
 * Widget catalog (plan §7.2) — the one place a widget type is defined.
 * Adding a widget means: add it here, add a renderer in components/board,
 * and nothing else. The editor, wizard, API validation, and renderer all read
 * this table.
 */

import { z } from "zod";
import { CANVAS_PRESETS, canvasSize, type CanvasPreset } from "./canvas";

export { CANVAS_PRESETS, canvasSize, isCanvasPreset, CANVAS_PRESET_IDS, type CanvasPreset } from "./canvas";

/** Landscape dimensions — the default canvas and what the unit tests assume. */
export const CANVAS_W = CANVAS_PRESETS.LANDSCAPE.w;
export const CANVAS_H = CANVAS_PRESETS.LANDSCAPE.h;
export const GRID = 20;

export const WIDGET_TYPES = [
  "greeting",
  "clock",
  "date",
  "weather",
  "calendar",
  "photos",
  "quote",
  "notes",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export function isWidgetType(v: string): v is WidgetType {
  return (WIDGET_TYPES as readonly string[]).includes(v);
}

export const CLOCK_STYLES = ["digital", "analog", "minimal", "stacked"] as const;

/** Shared by every widget: manual multiplier on top of the automatic size-based scale. */
const FontScale = z.number().min(0.5).max(2.5).default(1);

/** Per-type config schemas — every field has a default so `{}` is valid. */
const BASE_CONFIG = {
  greeting: z.object({
    name: z.string().trim().max(40, "Keep the greeting name under 40 characters.").default(""),
  }),
  clock: z.object({
    format: z.enum(["12h", "24h"]).default("12h"),
    showSeconds: z.boolean().default(false),
    style: z.enum(CLOCK_STYLES).default("digital"),
  }),
  date: z.object({ style: z.enum(["long", "short"]).default("long") }),
  weather: z.object({
    location: z.string().trim().min(1, "Enter a city or town.").max(80).default("Chicago"),
    units: z.enum(["f", "c"]).default("f"),
    /** detailed = now + conditions + 5 days (default); daily = 7-day; hourly = next 12 h; compact = now only. */
    view: z.enum(["detailed", "daily", "hourly", "compact"]).default("detailed"),
  }),
  calendar: z.object({
    /** week = columns from today (default); day = today's agenda; month = grid. */
    view: z.enum(["day", "week", "month"]).default("week"),
    days: z.number().int().min(1).max(14).default(7),
    /** Encrypted ICS link (see lib/board/secrets). Never the plaintext. */
    icsSecret: z.string().max(4096).optional(),
    /** Host-only mask for display, e.g. "https://calendar.google.com/…". */
    icsMask: z.string().max(200).optional(),
  }),
  photos: z.object({
    /**
     * Dwell per photo. 60s over a 40-photo album is a ~40-minute cycle, which
     * reads as calm from across a room; 20s read as busy on a wall you walk
     * past all day. Existing boards keep whatever they were set to - this is
     * only the default for new photo widgets.
     */
    intervalSec: z.number().int().min(5).max(600).default(60),
    /** "sample" = the bundled family photos; "link" = a pasted album/folder link. */
    source: z.enum(["sample", "link"]).default("sample"),
    /** Encrypted share link. Never the plaintext. */
    linkSecret: z.string().max(4096).optional(),
    linkMask: z.string().max(200).optional(),
  }),
  quote: z.object({}),
  notes: z.object({ text: z.string().max(2000).default("") }),
} satisfies Record<WidgetType, z.ZodObject<z.ZodRawShape>>;

function withFontScale<S extends z.ZodRawShape>(o: z.ZodObject<S>) {
  return o.extend({ fontScale: FontScale });
}
export const WIDGET_CONFIG = {
  greeting: withFontScale(BASE_CONFIG.greeting),
  clock: withFontScale(BASE_CONFIG.clock),
  date: withFontScale(BASE_CONFIG.date),
  weather: withFontScale(BASE_CONFIG.weather),
  calendar: withFontScale(BASE_CONFIG.calendar),
  photos: withFontScale(BASE_CONFIG.photos),
  quote: withFontScale(BASE_CONFIG.quote),
  notes: withFontScale(BASE_CONFIG.notes),
} satisfies Record<WidgetType, z.ZodTypeAny>;

/**
 * Text scale for a widget: grows with the widget's area relative to its
 * default size (so a weather card stretched to a quarter of the screen
 * doesn't keep 18px labels), then multiplied by the user's own setting.
 * Sqrt of the area ratio keeps a 2×2 enlargement at 2× text, not 4×.
 */
export function textScale(type: WidgetType, w: number, h: number, fontScale: number): number {
  const d = WIDGET_META[type].defaultSize;
  const auto = Math.sqrt((w * h) / (d.w * d.h));
  return Math.min(4, Math.max(0.5, auto)) * fontScale;
}

export type WidgetConfigOf<T extends WidgetType> = z.infer<(typeof WIDGET_CONFIG)[T]>;

/** Validates and fills defaults. Throws ZodError on bad input (API maps to 400). */
export function parseWidgetConfig<T extends WidgetType>(type: T, raw: unknown): WidgetConfigOf<T> {
  return WIDGET_CONFIG[type].parse(raw ?? {}) as WidgetConfigOf<T>;
}

/** Non-throwing variant for the render path: a bad row degrades to defaults. */
export function safeWidgetConfig<T extends WidgetType>(type: T, raw: unknown): WidgetConfigOf<T> {
  const r = WIDGET_CONFIG[type].safeParse(raw ?? {});
  return (r.success ? r.data : WIDGET_CONFIG[type].parse({})) as WidgetConfigOf<T>;
}

/**
 * Strips fields that must never leave the server (encrypted secrets). Call on
 * every widget config before it reaches an API response or a client prop.
 */
export function publicWidgetConfig(type: WidgetType, raw: unknown): unknown {
  const c = safeWidgetConfig(type, raw) as Record<string, unknown>;
  const { icsSecret: _i, linkSecret: _l, ...rest } = c;
  return rest;
}

export type WidgetMeta = {
  label: string;
  description: string;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  /** Pre-ticked in the setup wizard. */
  starter: boolean;
  /** Renders as bare text on the background, no surface card. ONE definition —
   *  the editor and the kiosk must never disagree about it (plan §4.2). */
  plain: boolean;
};

export const WIDGET_META: Record<WidgetType, WidgetMeta> = {
  greeting: { label: "Greeting", description: "“Good morning, Henderson” — changes with the time of day.", defaultSize: { w: 900, h: 120 }, minSize: { w: 300, h: 80 }, starter: true, plain: true },
  clock: { label: "Clock", description: "Digital, analog, minimal, or stacked. 12- or 24-hour.", defaultSize: { w: 480, h: 160 }, minSize: { w: 200, h: 100 }, starter: true, plain: true },
  date: { label: "Date", description: "Today’s date, long or short.", defaultSize: { w: 480, h: 80 }, minSize: { w: 240, h: 60 }, starter: true, plain: true },
  weather: { label: "Weather", description: "Now, hourly, or the week ahead for your town. No account needed.", defaultSize: { w: 480, h: 360 }, minSize: { w: 300, h: 200 }, starter: true, plain: false },
  calendar: { label: "Calendar", description: "Day, week, or month. Paste a Google Calendar or iCloud link for real events.", defaultSize: { w: 1300, h: 560 }, minSize: { w: 600, h: 300 }, starter: true, plain: false },
  photos: { label: "Photos", description: "A rotating photo panel. Paste a Google Photos album or Drive folder link.", defaultSize: { w: 480, h: 320 }, minSize: { w: 240, h: 180 }, starter: true, plain: false },
  quote: { label: "Quote of the day", description: "One warm line a day.", defaultSize: { w: 1300, h: 120 }, minSize: { w: 400, h: 80 }, starter: true, plain: false },
  notes: { label: "Notes", description: "A message for the household — “Dentist Thursday!”", defaultSize: { w: 1300, h: 120 }, minSize: { w: 300, h: 80 }, starter: false, plain: false },
};

type Geo = { x: number; y: number; w: number; h: number };

/** Starter layouts per canvas (plan §7.7) — nobody faces an empty canvas. */
export const STARTER_LAYOUTS: Record<CanvasPreset, Record<WidgetType, Geo>> = {
  LANDSCAPE: {
    greeting: { x: 40, y: 40, w: 900, h: 120 },
    clock: { x: 1400, y: 40, w: 480, h: 160 },
    date: { x: 1400, y: 220, w: 480, h: 80 },
    weather: { x: 1400, y: 320, w: 480, h: 360 },
    calendar: { x: 40, y: 200, w: 1300, h: 560 },
    photos: { x: 1400, y: 720, w: 480, h: 320 },
    quote: { x: 40, y: 780, w: 1300, h: 120 },
    notes: { x: 40, y: 920, w: 1300, h: 120 },
  },
  PORTRAIT: {
    greeting: { x: 40, y: 40, w: 1000, h: 120 },
    clock: { x: 40, y: 180, w: 1000, h: 160 },
    date: { x: 40, y: 360, w: 1000, h: 80 },
    weather: { x: 40, y: 460, w: 1000, h: 360 },
    calendar: { x: 40, y: 840, w: 1000, h: 520 },
    photos: { x: 40, y: 1380, w: 1000, h: 300 },
    quote: { x: 40, y: 1700, w: 1000, h: 100 },
    notes: { x: 40, y: 1820, w: 1000, h: 80 },
  },
  ULTRAWIDE: {
    greeting: { x: 40, y: 40, w: 1200, h: 120 },
    clock: { x: 2040, y: 40, w: 480, h: 160 },
    date: { x: 2040, y: 220, w: 480, h: 80 },
    weather: { x: 2040, y: 320, w: 480, h: 360 },
    calendar: { x: 40, y: 200, w: 1960, h: 560 },
    photos: { x: 2040, y: 720, w: 480, h: 320 },
    quote: { x: 40, y: 780, w: 1960, h: 120 },
    notes: { x: 40, y: 920, w: 1960, h: 120 },
  },
};

/** Back-compat alias used by older call sites and tests: the landscape layout. */
export const STARTER_LAYOUT = STARTER_LAYOUTS.LANDSCAPE;

export type WidgetGeometry = { x: number; y: number; w: number; h: number; z: number };

/** Clamp to the canvas and snap to the grid. Pure; unit-tested. */
export function normalizeGeometry(type: WidgetType, g: WidgetGeometry, preset: CanvasPreset = "LANDSCAPE"): WidgetGeometry {
  const { w: CW, h: CH } = canvasSize(preset);
  const min = WIDGET_META[type].minSize;
  const snap = (n: number) => Math.round(n / GRID) * GRID;
  let w = Math.max(min.w, snap(g.w));
  let h = Math.max(min.h, snap(g.h));
  w = Math.min(w, CW);
  h = Math.min(h, CH);
  const x = Math.min(Math.max(0, snap(g.x)), CW - w);
  const y = Math.min(Math.max(0, snap(g.y)), CH - h);
  return { x, y, w, h, z: Math.max(0, Math.min(999, Math.round(g.z))) };
}

export const GeometrySchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite(),
  h: z.number().finite(),
  z: z.number().finite().default(0),
});
