import type { BoardWidgetRow } from "@/lib/board/boards";
import { quoteForDay } from "@/lib/board/quotes";
import { weatherKey, type WeatherPayload } from "@/lib/board/weather-codes";
import { WeatherView } from "./weather-view";
import { DayView, MonthView, WeekView } from "./calendar-view";
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

const muted = { color: "var(--hearth-text-muted)" } as const;



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
      return <WeatherView w={w} units={c.units} mode={c.view} />;
    }
    case "calendar": {
      const c = safeWidgetConfig("calendar", widget.config);
      const feed = data.calendars[widget.id];
      if (c.view === "day") return <DayView now={data.now} feed={feed} />;
      if (c.view === "month") return <MonthView now={data.now} feed={feed} />;
      return <WeekView now={data.now} days={c.days} feed={feed} />;
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
