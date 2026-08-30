/**
 * Weather job — Open-Meteo, no key, no account (plan §6.4). Runs on a
 * schedule in `worker` and writes normalized rows to CachedPayload; the render
 * path only ever reads Postgres (§4.2).
 *
 * Hosts are fixed (not user-supplied), so this is outside the §8.3 SSRF guard's
 * scope — only the location *text* comes from the user, and it travels as a
 * URL-encoded query parameter. Timeouts and a response cap still apply.
 */

import { prisma } from "@ffd/db";
import { createLogger } from "@ffd/log";

const log = createLogger("worker.weather");

export const WEATHER_INTERVAL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 1_000_000;

type Geo = { name: string; country: string; lat: number; lon: number };

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
  if (cached) return cached.payload as Geo;

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location.trim())}&count=1&language=en&format=json`;
  const body = (await getJson(url)) as { results?: Array<{ name: string; country?: string; latitude: number; longitude: number }> };
  const hit = body.results?.[0];
  if (!hit) throw new Error(`No place found for "${location.trim()}" — try a nearby larger town`);
  const geo: Geo = { name: hit.name, country: hit.country ?? "", lat: hit.latitude, lon: hit.longitude };
  await prisma.cachedPayload.upsert({
    where: { kind_key: { kind: "geocode", key: k } },
    create: { kind: "geocode", key: k, payload: geo, fetchedAt: new Date() },
    update: { payload: geo, fetchedAt: new Date(), lastError: null, lastErrorAt: null },
  });
  return geo;
}

async function fetchForecast(geo: Geo) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&forecast_days=5`;
  const b = (await getJson(url)) as {
    current: { time: string; temperature_2m: number; weather_code: number; wind_speed_10m: number; is_day: number };
    daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: Array<number | null> };
  };
  return {
    place: geo,
    current: { tempC: b.current.temperature_2m, code: b.current.weather_code, windKmh: b.current.wind_speed_10m, isDay: b.current.is_day === 1, time: b.current.time },
    daily: b.daily.time.map((date, i) => ({
      date,
      code: b.daily.weather_code[i] ?? 0,
      maxC: b.daily.temperature_2m_max[i] ?? 0,
      minC: b.daily.temperature_2m_min[i] ?? 0,
      pop: b.daily.precipitation_probability_max[i] ?? null,
    })),
  };
}

/** One pass over every distinct weather location on every board. */
export async function runWeatherCycle(): Promise<void> {
  const rows = await prisma.boardWidget.findMany({ where: { type: "weather" }, select: { config: true } });
  const locations = new Set<string>();
  for (const r of rows) {
    const loc = (r.config as { location?: unknown } | null)?.location;
    if (typeof loc === "string" && loc.trim()) locations.add(loc.trim());
  }
  if (locations.size === 0) return;

  for (const location of locations) {
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

/** Starts the loop. First run shortly after boot so a new board fills in fast. */
export function startWeatherLoop(): () => void {
  let stopped = false;
  const run = () => {
    if (stopped) return;
    void runWeatherCycle().catch((err: unknown) => log.error("weather cycle crashed", { error: err instanceof Error ? err.message : "unknown" }));
  };
  const first = setTimeout(run, 10_000);
  const every = setInterval(run, WEATHER_INTERVAL_MS);
  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(every);
  };
}
