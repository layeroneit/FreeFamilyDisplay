import type { CSSProperties } from "react";

export type CalEvent = { uid: string; title: string; location: string | null; start: string; end: string; allDay: boolean };
export type CalendarFeed = { events: CalEvent[]; syncedAt: Date | null; error: string | null } | undefined;
export type CalendarMode = "day" | "week" | "month";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const muted: CSSProperties = { color: "var(--hearth-text-muted)" };

/**
 * The month, on a row of its own, big enough to read from the other side of
 * the kitchen. Every view gets one: the week view had no month anywhere on
 * it at all, so a display parked on the default view never said what month
 * it was (operator, 2026-08-31).
 *
 * A week that straddles two months says so ("OCT — NOV") rather than
 * silently naming whichever end it started at.
 */
function MonthBand({ from, to }: { from: Date; to?: Date }) {
  const spans = Boolean(to && (to.getMonth() !== from.getMonth() || to.getFullYear() !== from.getFullYear()));
  const label = spans ? `${MONTH_SHORT[from.getMonth()]} — ${MONTH_SHORT[to!.getMonth()]}` : MONTH[from.getMonth()];
  const year = spans && to!.getFullYear() !== from.getFullYear() ? `${from.getFullYear()}–${to!.getFullYear()}` : String(from.getFullYear());
  return (
    <div
      data-part="month"
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 16,
        borderBottom: "3px solid var(--hearth-accent-2)",
        paddingBottom: 4,
        marginBottom: 8,
      }}
    >
      <span
        style={{
          fontSize: 72,
          lineHeight: 1,
          fontWeight: 600,
          fontFamily: "var(--hearth-font-display)",
          textTransform: "uppercase",
          letterSpacing: 1,
          whiteSpace: "nowrap",
          // A long month on a narrow portrait board shrinks rather than clips.
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>
      <span style={{ ...muted, fontSize: 28, fontWeight: 500, whiteSpace: "nowrap" }}>{year}</span>
    </div>
  );
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const timeLabel = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "");
const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const eventsOn = (events: CalEvent[], d: Date) =>
  events.filter((e) => new Date(e.start) < new Date(d.getTime() + 86_400_000) && new Date(e.end) > d);

function Footer({ feed, count }: { feed: CalendarFeed; count: number }) {
  return (
    <div style={{ ...muted, fontSize: 16, marginTop: 8 }}>
      {!feed
        ? "Paste a calendar link in this widget’s settings to see real events."
        : feed.error && count === 0
          ? `Calendar: ${feed.error}`
          : feed.syncedAt
            ? `${count} event${count === 1 ? "" : "s"} · updated ${feed.syncedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${feed.error ? " · last refresh failed, showing what we have" : ""}`
            : "Reading your calendar… first sync lands within a minute."}
    </div>
  );
}

function EventLine({ e, day, size = 17 }: { e: CalEvent; day: Date; size?: number }) {
  const s = new Date(e.start);
  const timed = !e.allDay && sameDay(s, day);
  return (
    <li
      data-part="event"
      style={{
        fontSize: size,
        lineHeight: 1.25,
        // THREE lines, not two. A week is seven columns wide, so each one is
        // only ~15 characters across at this size; two lines meant "Jazz
        // Band…" and "Call grandma t…", which tell nobody anything. The
        // columns have vertical room to spare — most days hold far fewer than
        // the six events we allow — so the third line is close to free and it
        // is what turns a truncated fragment back into whole words.
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: 3,
        overflow: "hidden",
        // Break inside a long word only when it genuinely cannot fit, so
        // ordinary titles keep whole words on a line.
        overflowWrap: "break-word",
        hyphens: "auto",
        // Every pixel of a narrow column is a character, so the rule and its
        // gutter are as tight as they can be while still reading as a rule.
        borderLeft: "3px solid var(--hearth-accent-1)",
        paddingLeft: 6,
      }}
      title={e.title}
    >
      {/* The time must never break across lines — "7:15" above "AM" wastes a
          whole line of a column that only has three. */}
      {timed ? <span style={{ ...muted, fontSize: size * 0.82, marginRight: 5, whiteSpace: "nowrap" }}>{timeLabel(s)}</span> : null}
      {e.title}
    </li>
  );
}

/** Week (the default): N columns starting today. */
export function WeekView({ now, days, feed }: { now: Date; days: number; feed: CalendarFeed }) {
  const events = feed?.events ?? [];
  const cols = Array.from({ length: days }, (_, i) => {
    const d = startOfDay(now);
    d.setDate(d.getDate() + i);
    return d;
  });
  return (
    <div data-part="calendar" data-mode="week" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <MonthBand from={cols[0]!} to={cols[cols.length - 1]!} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(cols.length, 7)}, 1fr)`, gap: 8, flex: 1, minHeight: 0 }}>
        {cols.map((d, i) => (
          <div key={d.toISOString()} style={{ borderTop: `3px solid ${i === 0 ? "var(--hearth-accent-2)" : "var(--hearth-border)"}`, paddingTop: 10, minWidth: 0 }}>
            <div style={{ ...muted, fontSize: 18, textTransform: "uppercase", letterSpacing: 1 }}>{DAY[d.getDay()]}</div>
            <div style={{ fontSize: 40, fontWeight: 600, fontFamily: "var(--hearth-font-display)", color: i === 0 ? "var(--hearth-accent-2)" : "inherit" }}>{d.getDate()}</div>
            <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {eventsOn(events, d)
                .slice(0, 6)
                .map((e) => (
                  <EventLine key={e.uid} e={e} day={d} />
                ))}
            </ul>
          </div>
        ))}
      </div>
      <Footer feed={feed} count={events.length} />
    </div>
  );
}

/** Today as an agenda, with tomorrow as a smaller "up next". */
export function DayView({ now, feed }: { now: Date; feed: CalendarFeed }) {
  const events = feed?.events ?? [];
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const todays = eventsOn(events, today);
  const next = eventsOn(events, tomorrow);
  return (
    <div data-part="calendar" data-mode="day" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <MonthBand from={today} />
      {/* The weekday came from DAY[i] + "day", which reads "Tueday" and
          "Satday" three days a week. Spell them out. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, paddingBottom: 8 }}>
        <div style={{ fontSize: 56, fontWeight: 600, lineHeight: 1, fontFamily: "var(--hearth-font-display)", color: "var(--hearth-accent-2)" }}>{today.getDate()}</div>
        <div style={{ fontSize: 24, fontWeight: 600 }}>{DAY_FULL[today.getDay()]}</div>
      </div>
      <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0, overflow: "hidden" }}>
        {todays.length === 0 ? <li style={{ ...muted, fontSize: 22 }}>Nothing on the calendar today.</li> : null}
        {todays.slice(0, 10).map((e) => (
          <EventLine key={e.uid} e={e} day={today} size={24} />
        ))}
      </ul>
      {next.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ ...muted, fontSize: 15, textTransform: "uppercase", letterSpacing: 1 }}>Tomorrow</div>
          <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {next.slice(0, 3).map((e) => (
              <EventLine key={e.uid} e={e} day={tomorrow} size={16} />
            ))}
          </ul>
        </div>
      ) : null}
      <Footer feed={feed} count={events.length} />
    </div>
  );
}

/** Month grid: 5–6 rows of 7, with up to two event titles per cell and a "+n". */
export function MonthView({ now, feed }: { now: Date; feed: CalendarFeed }) {
  const events = feed?.events ?? [];
  const today = startOfDay(now);
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }
  // Drop a trailing all-next-month row.
  const rows = cells[35]!.getMonth() === today.getMonth() ? 6 : 5;
  return (
    <div data-part="calendar" data-mode="month" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <MonthBand from={today} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {DAY.map((d) => (
          <div key={d} style={{ ...muted, fontSize: 13, textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridTemplateRows: `repeat(${rows}, 1fr)`, gap: 4, flex: 1, minHeight: 0, marginTop: 4 }}>
        {cells.slice(0, rows * 7).map((d) => {
          const inMonth = d.getMonth() === today.getMonth();
          const isToday = sameDay(d, today);
          const evs = eventsOn(events, d);
          return (
            <div
              key={d.toISOString()}
              style={{
                borderTop: `2px solid ${isToday ? "var(--hearth-accent-2)" : "var(--hearth-border)"}`,
                padding: "4px 6px",
                minWidth: 0,
                minHeight: 0,
                overflow: "hidden",
                opacity: inMonth ? 1 : 0.4,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: isToday ? 700 : 500, color: isToday ? "var(--hearth-accent-2)" : "inherit" }}>{d.getDate()}</div>
              <ul style={{ listStyle: "none", margin: "2px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                {evs.slice(0, 2).map((e) => (
                  <li key={e.uid} title={e.title} style={{ fontSize: 12, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderLeft: "2px solid var(--hearth-accent-1)", paddingLeft: 4 }}>
                    {e.title}
                  </li>
                ))}
                {evs.length > 2 ? <li style={{ ...muted, fontSize: 11 }}>+{evs.length - 2} more</li> : null}
              </ul>
            </div>
          );
        })}
      </div>
      <Footer feed={feed} count={events.length} />
    </div>
  );
}
