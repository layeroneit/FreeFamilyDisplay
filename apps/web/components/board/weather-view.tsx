import type { CSSProperties } from "react";
import { cToUnits, describeWeatherCode, type WeatherPayload } from "@/lib/board/weather-codes";

export type WeatherMode = "detailed" | "daily" | "hourly" | "compact";
type Units = "f" | "c";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const muted: CSSProperties = { color: "var(--hearth-text-muted)" };

const windLabel = (kmh: number, units: Units) => (units === "f" ? `${Math.round(kmh * 0.621)} mph` : `${Math.round(kmh)} km/h`);
const hourLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric" }).replace(" ", "");

function Now({ w, units, big }: { w: WeatherPayload; units: Units; big: boolean }) {
  const cur = describeWeatherCode(w.current.code, w.current.isDay);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <span style={{ fontSize: big ? 72 : 52, lineHeight: 1 }}>{cur.glyph}</span>
      <div>
        <div style={{ fontSize: big ? 64 : 48, fontWeight: 600, lineHeight: 1, fontFamily: "var(--hearth-font-display)" }}>{cToUnits(w.current.tempC, units)}°</div>
        <div style={{ ...muted, fontSize: big ? 22 : 18 }}>
          {cur.label} · {w.place.name}
        </div>
      </div>
    </div>
  );
}

function DailyStrip({ w, units, count }: { w: WeatherPayload; units: Units; count: number }) {
  const days = w.daily.slice(0, count);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, days.length)}, 1fr)`, gap: 8 }}>
      {days.map((d, i) => {
        const dd = describeWeatherCode(d.code, true);
        return (
          <div key={d.date} style={{ textAlign: "center", fontSize: 18 }}>
            <div style={muted}>{i === 0 ? "Today" : DAY[new Date(d.date + "T12:00:00").getDay()]}</div>
            <div style={{ fontSize: 28 }}>{dd.glyph}</div>
            <div>
              <span style={{ fontWeight: 600 }}>{cToUnits(d.maxC, units)}°</span> <span style={muted}>{cToUnits(d.minC, units)}°</span>
            </div>
            {d.pop !== null && d.pop >= 20 ? <div style={{ ...muted, fontSize: 14 }}>💧{d.pop}%</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function HourlyStrip({ w, units, count }: { w: WeatherPayload; units: Units; count: number }) {
  const hours = (w.hourly ?? []).slice(0, count);
  if (hours.length === 0) return <div style={{ ...muted, fontSize: 18 }}>Hourly forecast arrives with the next weather refresh.</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${hours.length}, 1fr)`, gap: 4 }}>
      {hours.map((h, i) => {
        const hh = describeWeatherCode(h.code, h.isDay);
        return (
          <div key={h.time} style={{ textAlign: "center", fontSize: 15, minWidth: 0 }}>
            <div style={muted}>{i === 0 ? "Now" : hourLabel(h.time)}</div>
            <div style={{ fontSize: 22 }}>{hh.glyph}</div>
            <div style={{ fontWeight: 600 }}>{cToUnits(h.tempC, units)}°</div>
            {h.pop !== null && h.pop >= 20 ? <div style={{ ...muted, fontSize: 12 }}>{h.pop}%</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function Details({ w, units }: { w: WeatherPayload; units: Units }) {
  const items: Array<[string, string]> = [];
  if (w.current.feelsC !== undefined) items.push(["Feels like", `${cToUnits(w.current.feelsC, units)}°`]);
  if (w.current.humidity !== undefined) items.push(["Humidity", `${w.current.humidity}%`]);
  items.push(["Wind", windLabel(w.current.windKmh, units)]);
  const today = w.daily[0];
  if (today) items.push(["High / Low", `${cToUnits(today.maxC, units)}° / ${cToUnits(today.minC, units)}°`]);
  if (today?.pop !== null && today?.pop !== undefined) items.push(["Rain chance", `${today.pop}%`]);
  if (today?.sunrise && today?.sunset) items.push(["Sun", `${hourLabel(today.sunrise)}–${hourLabel(today.sunset)}`]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px 14px", fontSize: 17 }}>
      {items.map(([k, v]) => (
        <div key={k} style={{ minWidth: 0 }}>
          <div style={{ ...muted, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }}>{k}</div>
          <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

export function WeatherView({ w, units, mode }: { w: WeatherPayload; units: Units; mode: WeatherMode }) {
  const col: CSSProperties = { display: "flex", flexDirection: "column", height: "100%", gap: 12 };
  switch (mode) {
    case "compact":
      return (
        <div data-part="weather" data-mode="compact" style={{ ...col, justifyContent: "center" }}>
          <Now w={w} units={units} big />
        </div>
      );
    case "daily":
      return (
        <div data-part="weather" data-mode="daily" style={col}>
          <Now w={w} units={units} big={false} />
          <div style={{ marginTop: "auto" }}>
            <DailyStrip w={w} units={units} count={7} />
          </div>
        </div>
      );
    case "hourly":
      return (
        <div data-part="weather" data-mode="hourly" style={col}>
          <Now w={w} units={units} big={false} />
          <div style={{ marginTop: "auto" }}>
            <HourlyStrip w={w} units={units} count={12} />
          </div>
        </div>
      );
    default:
      return (
        <div data-part="weather" data-mode="detailed" style={col}>
          <Now w={w} units={units} big />
          <Details w={w} units={units} />
          <div style={{ marginTop: "auto" }}>
            <DailyStrip w={w} units={units} count={5} />
          </div>
        </div>
      );
  }
}
