/**
 * Layout budget for the week view's day rows: how many events each day lists,
 * which days fit, and at what scale.
 *
 * Fourth pass over this arithmetic, and each failure taught the same lesson
 * from a different side. Optimistic budgets clipped Saturday off the bottom;
 * then a worst-case budget reserved room for a fully busy "+n more" row seven
 * times over and showed the operator a two-day week (2026-08-31, ":/").
 *
 * The rule that survives all of them: cost the week that is ACTUALLY on the
 * calendar, and degrade in the order a family would choose - list fewer events
 * per day, then shrink the rows a little, and only then hide a day and say so
 * out loud in the footer.
 */

export type PlannedWeek = {
  /** How many of the requested days to render, from the front. */
  days: number;
  /** Uniform scale for the rows block, rowZoomFloor()..1. */
  zoom: number;
  /** How many events one day may list before it spends a "+n more" line. */
  perDay: number;
  /** Requested days that did not make the cut. */
  hidden: number;
};

/** One event line's height, and the type size it carries. */
export const ROW_EVENT_SIZE = 21;
export const ROW_EVENT_H = ROW_EVENT_SIZE * 1.25 + 4;
/** A row's own border and padding. */
export const ROW_CHROME = 2 + 7 + 7;
/** The "+n more" line and the gap above it, only when a day overflows. */
export const MORE_LINE_H = 19 * 1.4 + 5;
/** The date gutter floors a row's height even with nothing on that day. */
export const GUTTER_H = 34;
/** Rows may shrink this far to keep the whole week; smaller stops being
 *  readable from a couch, and hiding days honestly beats squinting. */
export const MIN_ROW_ZOOM = 0.62;
/** Past this many lines a day row stops being a glance and becomes a list. */
export const MAX_PER_DAY = 6;
/**
 * What listing one more event per day is allowed to cost in type size.
 *
 * A tenth of the type is worth another event on the row; much more than that
 * and the family is squinting at a fuller week, which is the wrong trade on a
 * wall. Without this the allowance was taken only when it cost nothing at all,
 * so a card with room for the entire week at 96% size still showed one event a
 * day and sent everyone to find a phone.
 */
export const PER_DAY_SHRINK_BUDGET = 0.9;

/**
 * The fixed furniture above and below the day rows: the month band (72px type,
 * its rule and margin) and the one-line footer.
 *
 * These are budgeted here rather than in the component because the shrink has
 * to be costed against the WHOLE card. When the zoom applied only to the rows,
 * the month band kept its full size while the events shrank underneath it: at
 * the floor the wall showed a 61px month over 11px events, a 5.5:1 ratio
 * against the 3.4:1 the card was drawn at. The furniture shrinks with the rows
 * now, which holds the proportion and hands most of the saving back as room.
 */
export const MONTH_BAND_H = 72 + 4 + 3 + 8;
export const FOOTER_H = 30;
export const FURNITURE_H = MONTH_BAND_H + FOOTER_H;

/**
 * How far the rows may shrink, given the household's own text-size setting.
 *
 * The floor rises with the setting, and that is the whole point. Shrink-to-fit
 * and the text-size knob pull in opposite directions: turning the knob up makes
 * the fixed furniture (month band, footer) cost more of the card, which left
 * less for the rows, which shrank them further - so at 1.2x the wall showed
 * SMALLER text than at 1.0x (15.3px against 16.4px). The knob fought itself.
 *
 * Tying the floor to the setting settles it. At the default the rows may still
 * give back 38% to keep Saturday on the card. Somebody who has deliberately
 * asked for big text gets big text, and loses trailing days instead - which the
 * footer states plainly rather than quietly shrinking under them.
 */
export function rowZoomFloor(fontScale: number): number {
  return Math.min(1, MIN_ROW_ZOOM * fontScale);
}

/**
 * How many of a day's events a ROW lists.
 *
 * In the rows layout a "+1 more" line costs MORE than the single event it
 * hides (31.6 units against 30.25) and tells the family strictly less - it is
 * the one summary never worth its own line, so the last event is shown rather
 * than summarised.
 *
 * This is a fact about row geometry, not a general rule: an event is one line
 * there, while in a narrow column it is two (COL_EVENT_H, 48.5) against a
 * marker's one, so columns slice plainly and must not use this.
 */
export function shownOn(eventCount: number, perDay: number): number {
  return eventCount === perDay + 1 ? eventCount : Math.min(eventCount, perDay);
}

/** What one day's row really costs at zoom 1, given its event count. */
export function dayRowCost(eventCount: number, perDay: number): number {
  const lines = shownOn(eventCount, perDay);
  const body = lines * ROW_EVENT_H + (eventCount > lines ? MORE_LINE_H : 0);
  return ROW_CHROME + Math.max(GUTTER_H, body);
}

/** What the whole week costs at a given per-day allowance. */
export function weekCost(eventCounts: number[], perDay: number): number {
  return eventCounts.reduce((sum, n) => sum + dayRowCost(n, perDay), 0);
}

/**
 * Fit the month band, `eventCounts.length` day rows, and the footer into
 * `boxH` — the card's interior height in the widget's own units. Returns how
 * many events each day lists, how many days to show, and the scale the whole
 * card body is drawn at. Never fewer than one day; never a zoom below the
 * floor for this text size.
 *
 * `perDay` is chosen from the week in front of it rather than from an equal
 * seven-way split of the card. The split reasoned about a card where every day
 * is equally busy, which is not a week anybody has: it concluded one event per
 * day on the default board, so a family with three things on Wednesday read
 * "Soccer" and "+2 more" and had to go find a phone. Rows are auto-sized, so a
 * quiet Tuesday's unused height belongs to Wednesday.
 */
export function planWeekRows(eventCounts: number[], boxH: number, fontScale = 1): PlannedWeek {
  const floor = rowZoomFloor(fontScale);
  // Listing more events may cost a little type size, but never so much that it
  // pushes the card below the floor - past there it costs whole days instead,
  // and a day is worth more than a fourth line on Wednesday.
  const comfort = Math.max(PER_DAY_SHRINK_BUDGET, floor);

  // The most generous allowance the card can carry at that price. Falls back
  // to 1: when even that overflows, the shrink and hide steps take over.
  let perDay = 1;
  for (let cap = MAX_PER_DAY; cap >= 1; cap--) {
    if (boxH / (FURNITURE_H + weekCost(eventCounts, cap)) >= comfort) {
      perDay = cap;
      break;
    }
  }

  // The furniture shrinks with the rows, so it is costed with them.
  const total = FURNITURE_H + weekCost(eventCounts, perDay);
  if (total <= boxH) return { days: eventCounts.length, zoom: 1, perDay, hidden: 0 };

  const zoom = boxH / total;
  if (zoom >= floor) return { days: eventCounts.length, zoom, perDay, hidden: 0 };

  // Even at the floor the week overflows: keep days from the front while they
  // fit at the floor scale. Today always shows.
  const budget = boxH / floor - FURNITURE_H;
  let used = 0;
  let days = 0;
  for (const n of eventCounts) {
    const c = dayRowCost(n, perDay);
    if (days >= 1 && used + c > budget) break;
    used += c;
    days++;
  }
  return { days, zoom: floor, perDay, hidden: eventCounts.length - days };
}

/**
 * Column mode's equivalent, for a card wide enough to give each day its own
 * column. Columns are fixed-width and side by side, so there is no borrowing
 * between them: capacity is simply how many events one column's height holds.
 *
 * Titles wrap, and a column is only ~170px wide, so an event is costed at two
 * of its three allowed lines. Optimistic single-line costing is what let a busy
 * column overrun its track and print over the footer.
 */
export const COL_EVENT_SIZE = 17;
export const COL_EVENT_H = COL_EVENT_SIZE * 1.25 * 2 + 6;
/** Border, padding, weekday label, date numeral, and the list's top margin. */
export const COL_HEAD_H = 3 + 10 + 22 + 48 + 8;

export function columnCapacity(availH: number): number {
  return Math.min(MAX_PER_DAY, Math.max(1, Math.floor((availH - COL_HEAD_H) / COL_EVENT_H)));
}
