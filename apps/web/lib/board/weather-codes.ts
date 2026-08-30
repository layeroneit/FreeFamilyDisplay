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

/** Shape the worker writes to CachedPayload(kind="weather"). */
export type WeatherPayload = {
  place: { name: string; country: string; lat: number; lon: number };
  current: { tempC: number; code: number; windKmh: number; isDay: boolean; time: string };
  daily: Array<{ date: string; code: number; maxC: number; minC: number; pop: number | null }>;
};
