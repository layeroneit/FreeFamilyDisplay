/**
 * Weather job — Open-Meteo, no key, no account (plan §6.4). Runs on a
 * schedule in `worker` and writes normalized rows to CachedPayload; the render
 * path only ever reads Postgres (§4.2).
 *
 * Hosts are fixed (not user-supplied), so this is outside the §8.3 SSRF guard's
 * scope — only the location *text* comes from the user, and it travels as a
 * URL-encoded query parameter. Everything that comes BACK is validated with
 * zod before it touches a URL or a database row (CLAUDE.md: external payloads
 * are a trust boundary).
 *
 * Audit-hardened: one cycle in flight at a time (the interval and the HTTP
 * trigger share it), a hard cap on locations per cycle, spacing between
 * upstream requests, geocode misses cached so an unresolvable town isn't
 * re-queried forever, and geocode hits refreshed monthly.
 */

import { z } from "zod";
import { prisma } from "@ffd/db";
import { createLogger } from "@ffd/log";

const log = createLogger("worker.weather");

export const WEATHER_INTERVAL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 1_000_000;
/** Family scale is a handful of towns; this is a safety rail, not a target. */
const MAX_LOCATIONS_PER_CYCLE = 50;
const SPACING_MS = 250;
const GEOCODE_MISS_TTL_MS = 24 * 60 * 60 * 1000;
const GEOCODE_HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const GeoSchema = z.object({
  name: z.string().min(1),
  country: z.string(),
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
});
type Geo = z.infer<typeof GeoSchema>;

const GeocodeResponse = z.object({
  results: z
    .array(z.object({ name: z.string(), country: z.string().optional(), latitude: z.number(), longitude: z.number() }))
    .optional(),
});

const ForecastResponse = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    weather_code: z.number().int(),
    wind_speed_10m: z.number(),
    is_day: z.number(),
    apparent_temperature: z.number().optional(),
    relative_humidity_2m: z.number().optional(),
  }),
  hourly: z
    .object({
      time: z.array(z.string()),
      temperature_2m: z.array(z.number()),
      weather_code: z.array(z.number().int()),
      precipitation_probability: z.array(z.number().nullable()),
      is_day: z.array(z.number()),
    })
    .optional(),
  daily: z.object({
    time: z.array(z.string()).min(1),
    weather_code: z.array(z.number().int()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_probability_max: z.array(z.number().nullable()),
    sunrise: z.array(z.string()).optional(),
    sunset: z.array(z.string()).optional(),
  }),
});

function key(location: string): string {
  return location.trim().toLowerCase().replace(/\s+/g, " ");
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": "FreeFamilyDisplay/0.1 (self-hosted family dashboard)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error("response too large");
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("response too large");
  return JSON.parse(text) as unknown;
}

async function geocode(location: string): Promise<Geo> {
  const k = key(location);
  const cached = await prisma.cachedPayload.findUnique({ where: { kind_key: { kind: "geocode", key: k } } });
  if (cached) {
    const age = Date.now() - cached.fetchedAt.getTime();
    const hit = GeoSchema.safeParse(cached.payload);
    if (hit.success && age < GEOCODE_HIT_TTL_MS) return hit.data;
    if (!hit.success && cached.lastError && age < GEOCODE_MISS_TTL_MS) {
      // Cached miss: don't hammer the geocoder for a town that doesn't resolve.
      throw new Error(cached.lastError);
    }
  }

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location.trim())}&count=1&language=en&format=json`;
  const body = GeocodeResponse.parse(await getJson(url));
  const hit = body.results?.[0];
  if (!hit) {
    const message = `No place found for "${location.trim()}" — try a nearby larger town`;
    await prisma.cachedPayload.upsert({
      where: { kind_key: { kind: "geocode", key: k } },
      create: { kind: "geocode", key: k, payload: {}, fetchedAt: new Date(), lastError: message, lastErrorAt: new Date() },
      update: { payload: {}, fetchedAt: new Date(), lastError: message, lastErrorAt: new Date() },
    });
    throw new Error(message);
  }
  const geo = GeoSchema.parse({ name: hit.name, country: hit.country ?? "", lat: hit.latitude, lon: hit.longitude });
  await prisma.cachedPayload.upsert({
    where: { kind_key: { kind: "geocode", key: k } },
    create: { kind: "geocode", key: k, payload: geo, fetchedAt: new Date() },
    update: { payload: geo, fetchedAt: new Date(), lastError: null, lastErrorAt: null },
  });
  return geo;
}

type HourlyRaw = z.infer<typeof ForecastResponse>["hourly"];

function hourlyWindow(h: HourlyRaw, nowIso: string) {
  if (!h) return undefined;
  // Both are local-time strings from the same timezone=auto response, so a
  // lexical compare on "YYYY-MM-DDTHH:MM" finds the current hour.
  const cur = nowIso.slice(0, 13);
  let start = h.time.findIndex((t) => t.slice(0, 13) >= cur);
  if (start < 0) start = 0;
  return h.time.slice(start, start + 24).map((time, j) => {
    const i = start + j;
    return {
      time,
      tempC: h.temperature_2m[i] ?? 0,
      code: h.weather_code[i] ?? 0,
      pop: h.precipitation_probability[i] ?? null,
      isDay: (h.is_day[i] ?? 1) === 1,
    };
  });
}

async function fetchForecast(geo: Geo) {
  // lat/lon are validated finite numbers in range — safe to interpolate.
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,is_day,apparent_temperature,relative_humidity_2m` +
    `&hourly=temperature_2m,weather_code,precipitation_probability,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
    `&timezone=auto&forecast_days=7`;
  const b = ForecastResponse.parse(await getJson(url));
  return {
    place: geo,
    current: {
      tempC: b.current.temperature_2m,
      code: b.current.weather_code,
      windKmh: b.current.wind_speed_10m,
      isDay: b.current.is_day === 1,
      time: b.current.time,
      ...(b.current.apparent_temperature !== undefined ? { feelsC: b.current.apparent_temperature } : {}),
      ...(b.current.relative_humidity_2m !== undefined ? { humidity: Math.round(b.current.relative_humidity_2m) } : {}),
    },
    // Next 24 hours from the current hour (Open-Meteo returns the whole day from 00:00).
    hourly: hourlyWindow(b.hourly, b.current.time),
    daily: b.daily.time.map((date, i) => ({
      date,
      code: b.daily.weather_code[i] ?? 0,
      maxC: b.daily.temperature_2m_max[i] ?? 0,
      minC: b.daily.temperature_2m_min[i] ?? 0,
      pop: b.daily.precipitation_probability_max[i] ?? null,
      ...(b.daily.sunrise?.[i] ? { sunrise: b.daily.sunrise[i] } : {}),
      ...(b.daily.sunset?.[i] ? { sunset: b.daily.sunset[i] } : {}),
    })),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cycle(): Promise<void> {
  const rows = await prisma.boardWidget.findMany({ where: { type: "weather" }, select: { config: true } });
  const locations = new Set<string>();
  for (const r of rows) {
    const loc = (r.config as { location?: unknown } | null)?.location;
    if (typeof loc === "string" && loc.trim()) locations.add(loc.trim().slice(0, 80));
  }
  if (locations.size === 0) return;
  if (locations.size > MAX_LOCATIONS_PER_CYCLE) {
    log.warn("weather locations capped this cycle", { requested: locations.size, cap: MAX_LOCATIONS_PER_CYCLE });
  }

  let n = 0;
  for (const location of locations) {
    if (n++ >= MAX_LOCATIONS_PER_CYCLE) break;
    if (n > 1) await sleep(SPACING_MS);
    const k = key(location);
    try {
      const geo = await geocode(location);
      const payload = await fetchForecast(geo);
      await prisma.cachedPayload.upsert({
        where: { kind_key: { kind: "weather", key: k } },
        create: { kind: "weather", key: k, payload, fetchedAt: new Date() },
        update: { payload, fetchedAt: new Date(), lastError: null, lastErrorAt: null },
      });
      log.info("weather updated", { key: k, place: geo.name });
    } catch (err) {
      const message = (err instanceof Error ? err.message : "unknown error").slice(0, 255);
      // Keep the stale payload (stale-but-labeled beats blank, plan §3); record the error.
      await prisma.cachedPayload
        .upsert({
          where: { kind_key: { kind: "weather", key: k } },
          create: { kind: "weather", key: k, payload: {}, fetchedAt: new Date(0), lastError: message, lastErrorAt: new Date() },
          update: { lastError: message, lastErrorAt: new Date() },
        })
        .catch(() => undefined);
      log.warn("weather fetch failed", { key: k, error: message });
    }
  }
}

let inFlight: Promise<void> | null = null;

/** Runs one cycle, or joins the one already running. Safe to call from anywhere. */
export function runWeatherCycle(): Promise<void> {
  if (!inFlight) {
    inFlight = cycle()
      .catch((err: unknown) => log.error("weather cycle crashed", { error: err instanceof Error ? err.message : "unknown" }))
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Starts the loop. First run shortly after boot so a new board fills in fast. */
export function startWeatherLoop(): () => void {
  const first = setTimeout(() => void runWeatherCycle(), 10_000);
  const every = setInterval(() => void runWeatherCycle(), WEATHER_INTERVAL_MS);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
