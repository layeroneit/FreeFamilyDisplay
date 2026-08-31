import type { CSSProperties } from "react";
import { textScale } from "@/lib/board/widgets";
import { COL_EVENT_SIZE, FURNITURE_H, ROW_EVENT_SIZE, columnCapacity, planWeekRows, shownOn } from "@/lib/board/week-plan";

export type CalEvent = { uid: string; title: string; location: string | null; start: string; end: string; allDay: boolean };
export type CalendarFeed = { events: CalEvent[]; syncedAt: Date | null; error: string | null } | undefined;
export type CalendarMode = "day" | "week" | "month";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const muted: CSSProperties = { color: "var(--hearth-text-muted)" };

/** Card padding (WidgetFrame) and the gap between day columns, in canvas px. */
const CARD_PAD = 48;
const COL_GAP = 8;
/**
 * Below this a day column is about nine characters wide, and no font size
 * rescues that - the layout has to change instead. Seven columns give a
 * portrait board ~129px and the default landscape calendar ~172px.
 */
const MIN_COLUMN_PX = 150;

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
const eventsOn = (events: CalEvent[], d: Date) => {
  // End of the LOCAL day, not d + 24h of milliseconds: on the 25-hour
  // fall-back day the shortcut ends the window at 23:00 and a 23:15 event
  // belongs to no day at all.
  const end = new Date(d);
  end.setDate(end.getDate() + 1);
  return events.filter((e) => new Date(e.start) < end && new Date(e.end) > d);
};

function Footer({ feed, count, note }: { feed: CalendarFeed; count: number; note?: string | undefined }) {
  return (
    // One line, always: FOOTER_H is what the row budget subtracts, so a footer
    // that wrapped to two would quietly clip the bottom day off the card. The
    // note leads, because it is the half that tells somebody what to do.
    <div style={{ ...muted, fontSize: 16, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {note ? <span>{note} &middot; </span> : null}
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

function EventLine({ e, day, size = COL_EVENT_SIZE }: { e: CalEvent; day: Date; size?: number }) {
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
        // NEVER split a word. The old rule was break-word + hyphens:auto, on the
        // theory that a word only breaks when it "genuinely cannot fit" - but in
        // a 129px column almost nothing fits, so real boards rendered "Jaz z
        // Band", "Roboti cs" and "Cro chet Club" (operator screenshot,
        // 2026-08-31). A clipped whole word beats a broken one, and a column too
        // narrow to hold a word at all is handled by switching layout instead.
        overflowWrap: "normal",
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

/** Week as columns, for a card wide enough to give each day real room. */
function WeekColumns({ cols, events, perDay }: { cols: Date[]; events: CalEvent[]; perDay: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(cols.length, 7)}, 1fr)`, gap: COL_GAP, flex: 1, minHeight: 0 }}>
      {cols.map((d, i) => (
        <div
          key={d.toISOString()}
          style={{
            borderTop: `3px solid ${i === 0 ? "var(--hearth-accent-2)" : "var(--hearth-border)"}`,
            paddingTop: 10,
            minWidth: 0,
            // A grid item defaults to min-height:auto, so a busy column grew
            // past its track and printed over the footer. Both are needed.
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div style={{ ...muted, fontSize: 18, textTransform: "uppercase", letterSpacing: 1 }}>{DAY[d.getDay()]}</div>
          <div style={{ fontSize: 40, fontWeight: 600, fontFamily: "var(--hearth-font-display)", color: i === 0 ? "var(--hearth-accent-2)" : "inherit" }}>{d.getDate()}</div>
          <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {(() => {
              // A column that overruns its track used to print over the footer,
              // so what does not fit is summarised rather than silently clipped.
              // A plain slice, not shownOn: a column event is two lines against
              // the marker's one, so here the marker really is the cheaper way
              // to say it.
              const evs = eventsOn(events, d);
              const take = Math.min(evs.length, perDay);
              const rest = evs.length - take;
              return (
                <>
                  {evs.slice(0, take).map((e) => (
                    <EventLine key={e.uid} e={e} day={d} />
                  ))}
                  {rest > 0 ? <li style={{ ...muted, fontSize: COL_EVENT_SIZE - 2 }}>+{rest} more</li> : null}
                </>
              );
            })()}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Week as one row per day - the layout for a card too narrow to column up,
 * which is every portrait board. The date sits in a fixed gutter and the event
 * takes the whole remaining width, so a title gets ~800px instead of ~129 and
 * never has to wrap at all.
 *
 * Rows are auto-sized rather than an equal N-way split: a day with nothing on
 * it should hand its space to a day with three things on it, and that is what
 * lets a busy week fit at a size you can read across a room.
 */
function WeekRows({ cols, events, perDay }: { cols: Date[]; events: CalEvent[]; perDay: number }) {
  return (
    // The shrink that keeps every day on the card lives on the calendar body,
    // one level up, so the month band gives up its share of the space too.
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {cols.map((d, i) => {
        const evs = eventsOn(events, d);
        // shownOn, not a plain slice: the budget this row was planned against
        // never spends a "+1 more" line, so neither may the row.
        const shown = evs.slice(0, shownOn(evs.length, perDay));
        const rest = evs.length - shown.length;
        const isFirst = i === 0;
        return (
          <div
            key={d.toISOString()}
            style={{
              display: "grid",
              gridTemplateColumns: "128px 1fr",
              gap: 16,
              alignItems: "start",
              borderTop: `2px solid ${isFirst ? "var(--hearth-accent-2)" : "var(--hearth-border)"}`,
              padding: "7px 0",
              // A row must keep its natural height. It is a flex item, so the
              // default flex-shrink:1 - and worse, an explicit minHeight:0 -
              // let the column squash rows BELOW their content, at which point
              // each ul spilled out of its own row and printed on top of the
              // next one (operator screenshot, 2026-08-31). Rows hold their
              // size; the container clips at the bottom, which is honest.
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 34, fontWeight: 600, fontFamily: "var(--hearth-font-display)", lineHeight: 1, color: isFirst ? "var(--hearth-accent-2)" : "inherit" }}>
                {d.getDate()}
              </span>
              <span style={{ ...muted, fontSize: 19, textTransform: "uppercase", letterSpacing: 1 }}>{DAY[d.getDay()]}</span>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
              {shown.length === 0 ? <li style={{ ...muted, fontSize: 20, lineHeight: 1.2 }}>&mdash;</li> : null}
              {shown.map((e) => {
                const st = new Date(e.start);
                const timed = !e.allDay && sameDay(st, d);
                return (
                  <li
                    key={e.uid}
                    data-part="event"
                    title={e.title}
                    style={{
                      fontSize: ROW_EVENT_SIZE,
                      lineHeight: 1.25,
                      // Full width means a title almost never runs out of room.
                      // When one does, an ellipsis is honest; a mid-word split
                      // is not.
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      borderLeft: "3px solid var(--hearth-accent-1)",
                      paddingLeft: 9,
                      minWidth: 0,
                    }}
                  >
                    {timed ? <span style={{ ...muted, marginRight: 8 }}>{timeLabel(st)}</span> : null}
                    {e.title}
                  </li>
                );
              })}
              {rest > 0 ? <li style={{ ...muted, fontSize: 19, paddingLeft: 12 }}>+{rest} more</li> : null}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Week view. Chooses columns or day-rows from how wide a column would actually
 * be on the physical screen - canvas pixels, not the card's zoomed internal
 * units, because canvas pixels are what the eye across the room is given.
 */
export function WeekView({
  now,
  days,
  feed,
  w,
  h,
  fontScale = 1,
}: {
  now: Date;
  days: number;
  feed: CalendarFeed;
  /** Widget size in canvas px, so the layout can answer to the real card. */
  w: number;
  h: number;
  fontScale?: number;
}) {
  const events = feed?.events ?? [];
  const cols = Array.from({ length: days }, (_, i) => {
    const d = startOfDay(now);
    d.setDate(d.getDate() + i);
    return d;
  });

  const colPx = (w - CARD_PAD - COL_GAP * (cols.length - 1)) / cols.length;
  // Beyond seven, column mode would wrap onto an unlabeled second grid row
  // that reads as a second week; day rows handle any count honestly.
  const dense = colPx < MIN_COLUMN_PX || cols.length > 7;

  // Everything inside the card is drawn in zoomed units, so convert the real
  // card height into them before budgeting rows.
  const scale = textScale("calendar", w, h, fontScale);
  const boxH = (h - CARD_PAD) / scale;
  // A plan costed from the week that is actually on the calendar, in the order
  // a family would give things up: fewer events listed per day, then slightly
  // smaller rows, and only then a day dropped and named in the footer.
  const plan = planWeekRows(cols.map((d) => eventsOn(events, d).length), boxH, fontScale);
  // Column mode clips each column independently, so it needs no shrink — only
  // the day-rows layout is budgeted as one block.
  const zoom = dense ? plan.zoom : 1;
  const shown = dense ? cols.slice(0, plan.days) : cols;
  const hidden = dense ? plan.hidden : 0;
  const note = hidden > 0 ? `+${hidden} more day${hidden === 1 ? "" : "s"} — a taller calendar shows the whole week` : undefined;

  return (
    <div
      data-part="calendar"
      data-mode="week"
      data-layout={dense ? "rows" : "columns"}
      // The zoom rides the WHOLE body, month band and footer included. On the
      // rows alone it shrank the events out from under a month band that kept
      // its full size, which is what made a tight week look wrong rather than
      // merely small.
      style={{ display: "flex", flexDirection: "column", height: "100%", zoom: zoom === 1 ? undefined : zoom }}
    >
      <MonthBand from={shown[0]!} to={shown[shown.length - 1]!} />
      {dense ? (
        <WeekRows cols={shown} events={events} perDay={plan.perDay} />
      ) : (
        <WeekColumns cols={cols} events={events} perDay={columnCapacity(boxH - FURNITURE_H)} />
      )}
      <Footer feed={feed} count={events.length} note={note} />
    </div>
  );
}

/** Today as an agenda, with tomorrow as a smaller "up next". */
export function DayView({ now, feed }: { now: Date; feed: CalendarFeed }) {
  const events = feed?.events ?? [];
  const today = startOfDay(now);
  // Not +86,400,000ms: a DST-transition day is 23 or 25 hours long, and the
  // millisecond shortcut makes an event in the odd hour vanish from every day.
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
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
