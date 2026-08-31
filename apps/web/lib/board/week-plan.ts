/**
 * Layout budget for the week view's day rows: which days fit, at what scale.
 *
 * Third rewrite of this arithmetic, and each failure taught the same lesson
 * from a different side. Optimistic budgets clipped Saturday off the bottom;
 * then a worst-case budget reserved room for a fully busy "+n more" row seven
 * times over and showed the operator a two-day week (2026-08-31, ":/").
 *
 * The rule that survives both: cost the week that is ACTUALLY on the calendar,
 * and when it doesn't fit, shrink the rows before hiding any day - a family
 * needs Saturday more than it needs 21px over 19px. Only below a readability
 * floor do trailing days drop, and the footer says so out loud.
 */

export type PlannedWeek = {
  /** How many of the requested days to render, from the front. */
  days: number;
  /** Uniform scale for the rows block, MIN_ROW_ZOOM..1. */
  zoom: number;
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

/** What one day's row really costs at zoom 1, given its event count. */
export function dayRowCost(eventCount: number, perDay: number): number {
  const lines = Math.min(eventCount, perDay);
  const body = lines * ROW_EVENT_H + (eventCount > perDay ? MORE_LINE_H : 0);
  return ROW_CHROME + Math.max(GUTTER_H, body);
}

/**
 * Fit `eventCounts.length` day rows into `availH` (both in the widget's own
 * units). Returns how many days to show and at what scale. Never fewer than
 * one day; never a zoom below MIN_ROW_ZOOM.
 */
export function planWeekRows(eventCounts: number[], perDay: number, availH: number): PlannedWeek {
  const costs = eventCounts.map((n) => dayRowCost(n, perDay));
  const total = costs.reduce((a, b) => a + b, 0);
  if (total <= availH) return { days: costs.length, zoom: 1, hidden: 0 };

  const zoom = availH / total;
  if (zoom >= MIN_ROW_ZOOM) return { days: costs.length, zoom, hidden: 0 };

  // Even at the floor the week overflows: keep days from the front while they
  // fit at the floor scale. Today always shows.
  const budget = availH / MIN_ROW_ZOOM;
  let used = 0;
  let days = 0;
  for (const c of costs) {
    if (days >= 1 && used + c > budget) break;
    used += c;
    days++;
  }
  return { days, zoom: MIN_ROW_ZOOM, hidden: costs.length - days };
}
