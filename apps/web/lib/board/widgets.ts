/**
 * Widget catalog (plan §7.2) — the one place a widget type is defined.
 * Adding a widget means: add it here, add a renderer in components/board,
 * and nothing else. The editor, wizard, API validation, and renderer all read
 * this table.
 */

import { z } from "zod";

export const CANVAS_W = 1920;
export const CANVAS_H = 1080;
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

/** Per-type config schemas — every field has a default so `{}` is valid. */
export const WIDGET_CONFIG = {
  greeting: z.object({ name: z.string().trim().max(40).default("") }),
  clock: z.object({
    format: z.enum(["12h", "24h"]).default("12h"),
    showSeconds: z.boolean().default(false),
  }),
  date: z.object({ style: z.enum(["long", "short"]).default("long") }),
  weather: z.object({
    location: z.string().trim().min(1, "Enter a city or town.").max(80).default("Chicago"),
    units: z.enum(["f", "c"]).default("f"),
  }),
  calendar: z.object({ days: z.number().int().min(1).max(14).default(7) }),
  photos: z.object({ intervalSec: z.number().int().min(5).max(600).default(20) }),
  quote: z.object({}),
  notes: z.object({ text: z.string().max(2000).default("") }),
} satisfies Record<WidgetType, z.ZodTypeAny>;

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

export type WidgetMeta = {
  label: string;
  description: string;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  /** Pre-ticked in the setup wizard. */
  starter: boolean;
};

export const WIDGET_META: Record<WidgetType, WidgetMeta> = {
  greeting: {
    label: "Greeting",
    description: "“Good morning, Henderson” — changes with the time of day.",
    defaultSize: { w: 900, h: 120 },
    minSize: { w: 300, h: 80 },
    starter: true,
  },
  clock: {
    label: "Clock",
    description: "Big, readable time. 12- or 24-hour.",
    defaultSize: { w: 480, h: 160 },
    minSize: { w: 240, h: 100 },
    starter: true,
  },
  date: {
    label: "Date",
    description: "Today’s date, long or short.",
    defaultSize: { w: 480, h: 80 },
    minSize: { w: 240, h: 60 },
    starter: true,
  },
  weather: {
    label: "Weather",
    description: "Now plus a 5-day strip for your town. No account needed.",
    defaultSize: { w: 480, h: 360 },
    minSize: { w: 300, h: 200 },
    starter: true,
  },
  calendar: {
    label: "Calendar",
    description: "The week ahead. Connect calendars when the connector lands.",
    defaultSize: { w: 1300, h: 560 },
    minSize: { w: 600, h: 300 },
    starter: true,
  },
  photos: {
    label: "Photos",
    description: "A rotating photo panel. Sample photos until you connect an album.",
    defaultSize: { w: 480, h: 320 },
    minSize: { w: 240, h: 180 },
    starter: true,
  },
  quote: {
    label: "Quote of the day",
    description: "One warm line a day.",
    defaultSize: { w: 1300, h: 120 },
    minSize: { w: 400, h: 80 },
    starter: true,
  },
  notes: {
    label: "Notes",
    description: "A message for the household — “Dentist Thursday!”",
    defaultSize: { w: 1300, h: 120 },
    minSize: { w: 300, h: 80 },
    starter: false,
  },
};

/** Starter layout (plan §7.7) — nobody faces an empty canvas. */
export const STARTER_LAYOUT: Record<WidgetType, { x: number; y: number; w: number; h: number }> = {
  greeting: { x: 40, y: 40, w: 900, h: 120 },
  clock: { x: 1400, y: 40, w: 480, h: 160 },
  date: { x: 1400, y: 220, w: 480, h: 80 },
  weather: { x: 1400, y: 320, w: 480, h: 360 },
  calendar: { x: 40, y: 200, w: 1300, h: 560 },
  photos: { x: 1400, y: 720, w: 480, h: 320 },
  quote: { x: 40, y: 780, w: 1300, h: 120 },
  notes: { x: 40, y: 920, w: 1300, h: 120 },
};

export type WidgetGeometry = { x: number; y: number; w: number; h: number; z: number };

/** Clamp to the canvas and snap to the grid. Pure; unit-tested. */
export function normalizeGeometry(type: WidgetType, g: WidgetGeometry): WidgetGeometry {
  const min = WIDGET_META[type].minSize;
  const snap = (n: number) => Math.round(n / GRID) * GRID;
  let w = Math.max(min.w, snap(g.w));
  let h = Math.max(min.h, snap(g.h));
  w = Math.min(w, CANVAS_W);
  h = Math.min(h, CANVAS_H);
  const x = Math.min(Math.max(0, snap(g.x)), CANVAS_W - w);
  const y = Math.min(Math.max(0, snap(g.y)), CANVAS_H - h);
  return { x, y, w, h, z: Math.max(0, Math.min(999, Math.round(g.z))) };
}

export const GeometrySchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite(),
  h: z.number().finite(),
  z: z.number().finite().default(0),
});
