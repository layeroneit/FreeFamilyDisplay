import { z } from "zod";

/** WMO weather interpretation codes (Open-Meteo) → label + glyph. */
export function describeWeatherCode(code: number, isDay = true): { label: string; glyph: string } {
  if (code === 0) return { label: "Clear", glyph: isDay ? "☀️" : "🌙" };
  if (code === 1) return { label: "Mostly clear", glyph: isDay ? "🌤️" : "🌙" };
  if (code === 2) return { label: "Partly cloudy", glyph: "⛅" };
  if (code === 3) return { label: "Overcast", glyph: "☁️" };
  if (code === 45 || code === 48) return { label: "Fog", glyph: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", glyph: "🌦️" };
  if (code >= 61 && code <= 67) return { label: "Rain", glyph: "🌧️" };
  if (code >= 71 && code <= 77) return { label: "Snow", glyph: "🌨️" };
  if (code >= 80 && code <= 82) return { label: "Showers", glyph: "🌧️" };
  if (code === 85 || code === 86) return { label: "Snow showers", glyph: "🌨️" };
  if (code === 95) return { label: "Thunderstorm", glyph: "⛈️" };
  if (code === 96 || code === 99) return { label: "Thunderstorm, hail", glyph: "⛈️" };
  return { label: "—", glyph: "🌡️" };
}

export function cToUnits(c: number, units: "f" | "c"): number {
  return units === "f" ? Math.round((c * 9) / 5 + 32) : Math.round(c);
}

/** Canonical cache key for a location string — shared with the worker. */
export function weatherKey(location: string): string {
  return location.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Shape the worker writes to CachedPayload(kind="weather"). Validated on the
 * way OUT of the database too (CLAUDE.md: zod at every trust boundary) — a
 * malformed row degrades to "fetching…" instead of crashing the board.
 */
export const WeatherPayloadSchema = z.object({
  place: z.object({ name: z.string(), country: z.string(), lat: z.number().finite(), lon: z.number().finite() }),
  current: z.object({
    tempC: z.number().finite(),
    code: z.number().int(),
    windKmh: z.number().finite(),
    isDay: z.boolean(),
    time: z.string(),
    feelsC: z.number().finite().optional(),
    humidity: z.number().int().optional(),
  }),
  hourly: z
    .array(z.object({ time: z.string(), tempC: z.number().finite(), code: z.number().int(), pop: z.number().nullable(), isDay: z.boolean() }))
    .optional(),
  daily: z
    .array(
      z.object({
        date: z.string(),
        code: z.number().int(),
        maxC: z.number().finite(),
        minC: z.number().finite(),
        pop: z.number().nullable(),
        sunrise: z.string().optional(),
        sunset: z.string().optional(),
      }),
    )
    .min(1),
});
export type WeatherPayload = z.infer<typeof WeatherPayloadSchema>;
