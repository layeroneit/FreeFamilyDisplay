import type { BoardWidgetRow } from "@/lib/board/boards";
import { quoteForDay } from "@/lib/board/quotes";
import { cToUnits, describeWeatherCode, weatherKey, type WeatherPayload } from "@/lib/board/weather-codes";
import { safeWidgetConfig } from "@/lib/board/widgets";
import { ClockWidget } from "./clock";
import { PhotosWidget } from "./photos";

export type CalendarEvent = { uid: string; title: string; location: string | null; start: string; end: string; allDay: boolean };
export type CalendarFeed = { events: CalendarEvent[]; syncedAt: Date | null; error: string | null };

/** Data the render path resolved from Postgres for this board. */
export type BoardData = {
  viewerName: string;
  /** Bundled sample photos (the login set). */
  photoSrcs: string[];
  weather: Record<string, WeatherPayload | undefined>;
  /** keyed by calendar widget id — present only when the widget has a link. */
  calendars: Record<string, CalendarFeed>;
  /** keyed by photos widget id — present only when the widget uses a link. */
  linkPhotos: Record<string, { srcs: string[]; error: string | null }>;
  now: Date;
};

function greetingFor(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const muted = { color: "var(--hearth-text-muted)" } as const;

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function timeLabel(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "");
}

/** Server component: renders one widget's content from its row + board data. */
export function WidgetView({ widget, data }: { widget: BoardWidgetRow; data: BoardData }) {
  switch (widget.type) {
    case "greeting": {
      const c = safeWidgetConfig("greeting", widget.config);
      const name = c.name || data.viewerName;
      return (
        <div data-part="text" style={{ fontSize: 64, fontWeight: 600, fontFamily: "var(--hearth-font-display)", lineHeight: 1.1 }}>
          {greetingFor(data.now.getHours())}, <span style={{ color: "var(--hearth-accent-1)" }}>{name}</span>
        </div>
      );
    }
    case "clock": {
      const c = safeWidgetConfig("clock", widget.config);
      return <ClockWidget format={c.format} showSeconds={c.showSeconds} style={c.style} />;
    }
    case "date": {
      const c = safeWidgetConfig("date", widget.config);
      const text =
        c.style === "long"
          ? data.now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
          : data.now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      return (
        <div data-part="text" style={{ ...muted, fontSize: 36, textAlign: "right", fontWeight: 500 }}>
          {text}
        </div>
      );
    }
    case "weather": {
      const c = safeWidgetConfig("weather", widget.config);
      const w = data.weather[weatherKey(c.location)];
      if (!w) {
        return (
          <div data-part="pending" style={{ ...muted, fontSize: 24 }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: "var(--hearth-text)" }}>{c.location}</div>
            Fetching the forecast… the first update lands within a few minutes.
          </div>
        );
      }
      const cur = describeWeatherCode(w.current.code, w.current.isDay);
      return (
        <div data-part="weather" style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 72, lineHeight: 1 }}>{cur.glyph}</span>
            <div>
              <div style={{ fontSize: 64, fontWeight: 600, lineHeight: 1, fontFamily: "var(--hearth-font-display)" }}>
                {cToUnits(w.current.tempC, c.units)}°
              </div>
              <div style={{ ...muted, fontSize: 22 }}>
                {cur.label} · {w.place.name}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, Math.min(5, w.daily.length))}, 1fr)`, gap: 8, marginTop: "auto" }}>
            {w.daily.slice(0, 5).map((d) => {
              const dd = describeWeatherCode(d.code, true);
              return (
                <div key={d.date} style={{ textAlign: "center", fontSize: 18 }}>
                  <div style={muted}>{DAY[new Date(d.date + "T12:00:00").getDay()]}</div>
                  <div style={{ fontSize: 28 }}>{dd.glyph}</div>
                  <div>
                    <span style={{ fontWeight: 600 }}>{cToUnits(d.maxC, c.units)}°</span>{" "}
                    <span style={muted}>{cToUnits(d.minC, c.units)}°</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    case "calendar": {
      const c = safeWidgetConfig("calendar", widget.config);
      const feed = data.calendars[widget.id];
      const days = Array.from({ length: c.days }, (_, i) => {
        const d = new Date(data.now);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + i);
        return d;
      });
      const shown = days;
      const events = feed?.events ?? [];
      return (
        <div data-part="calendar" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(shown.length, 7)}, 1fr)`, gap: 12, flex: 1, minHeight: 0 }}>
            {shown.map((d, i) => {
              const dayEvents = events
                .filter((e) => {
                  const s = new Date(e.start);
                  const en = new Date(e.end);
                  return s < new Date(d.getTime() + 86_400_000) && en > d;
                })
                .slice(0, 6);
              return (
                <div key={d.toISOString()} style={{ borderTop: `3px solid ${i === 0 ? "var(--hearth-accent-2)" : "var(--hearth-border)"}`, paddingTop: 10, minWidth: 0 }}>
                  <div style={{ ...muted, fontSize: 18, textTransform: "uppercase", letterSpacing: 1 }}>{DAY[d.getDay()]}</div>
                  <div style={{ fontSize: 40, fontWeight: 600, fontFamily: "var(--hearth-font-display)", color: i === 0 ? "var(--hearth-accent-2)" : "inherit" }}>
                    {d.getDate()}
                  </div>
                  <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {dayEvents.map((e) => {
                      const s = new Date(e.start);
                      const timed = !e.allDay && sameDay(s, d);
                      return (
                        <li key={e.uid} data-part="event" style={{ fontSize: 17, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderLeft: "3px solid var(--hearth-accent-1)", paddingLeft: 8 }} title={e.title}>
                          {timed ? <span style={{ ...muted, fontSize: 14, marginRight: 6 }}>{timeLabel(s)}</span> : null}
                          {e.title}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
          <div style={{ ...muted, fontSize: 16, marginTop: 8 }}>
            {!feed
              ? "Paste a calendar link in this widget’s settings to see real events."
              : feed.error && events.length === 0
                ? `Calendar: ${feed.error}`
                : feed.syncedAt
                  ? `${events.length} event${events.length === 1 ? "" : "s"} · updated ${feed.syncedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${feed.error ? " · last refresh failed, showing what we have" : ""}`
                  : "Reading your calendar… first sync lands within a minute."}
          </div>
        </div>
      );
    }
    case "photos": {
      const c = safeWidgetConfig("photos", widget.config);
      const link = data.linkPhotos[widget.id];
      if (c.source === "link" && link) {
        if (link.srcs.length === 0) {
          return (
            <div data-part="pending" style={{ ...muted, fontSize: 22, padding: 8 }}>
              {link.error ? `Photos: ${link.error}` : "Reading your album… photos land within a minute."}
            </div>
          );
        }
        return <PhotosWidget srcs={link.srcs} intervalSec={c.intervalSec} />;
      }
      return <PhotosWidget srcs={data.photoSrcs} intervalSec={c.intervalSec} note="Sample photos — paste an album link in settings" />;
    }
    case "quote": {
      const q = quoteForDay();
      return (
        <div data-part="text" style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
          <div style={{ fontSize: 30, fontStyle: "italic", lineHeight: 1.3 }}>“{q.text}”</div>
          <div style={{ ...muted, fontSize: 20, marginTop: 6 }}>— {q.by}</div>
        </div>
      );
    }
    case "notes": {
      const c = safeWidgetConfig("notes", widget.config);
      return (
        <div data-part="text" style={{ fontSize: 30, lineHeight: 1.35, whiteSpace: "pre-wrap" }}>
          {c.text || <span style={muted}>Tap to write a note for the household.</span>}
        </div>
      );
    }
    default:
      return null;
  }
}
