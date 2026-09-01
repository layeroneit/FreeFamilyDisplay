import assert from "node:assert/strict";
import test from "node:test";
import {
  COL_EVENT_H,
  COL_EVENT_SIZE,
  COL_HEAD_H,
  COL_LINE_CLAMP,
  COL_MORE_H,
  FURNITURE_H,
  HARD_MIN_ZOOM,
  MIN_DAYS_SHOWN,
  MIN_ROW_ZOOM,
  MONTH_BAND_H,
  MORE_LINE_H,
  ROW_EVENT_H,
  ROW_EVENT_SIZE,
  columnCapacity,
  dayRowCost,
  planWeekRows,
  rowZoomFloor,
  shownOn,
} from "./week-plan";

/** The portrait board's calendar interior (~1000x520), in its own units. */
const PORTRAIT_BOX = (520 - 48) / 0.845; // ≈ 558

/** The week the operator photographed on 2026-08-31. */
const REAL_WEEK = [0, 3, 3, 4, 3, 1, 0];

test("a quiet week shows all seven days at full size", () => {
  const plan = planWeekRows([0, 1, 0, 1, 0, 0, 0], PORTRAIT_BOX);
  assert.equal(plan.days, 7);
  assert.equal(plan.zoom, 1);
  assert.equal(plan.hidden, 0);
});

test("the real week on the real board lists its events, not '+n more'", () => {
  // The operator's photograph, 2026-08-31: three days on the wall, "+3 more"
  // beside the one event it did show, and half the card blank underneath.
  // This fixture has to be the BUSY week - a week with at most one event a
  // day costs the same at every allowance, so asserting on a quiet one
  // passes whatever the implementation does.
  const plan = planWeekRows(REAL_WEEK, PORTRAIT_BOX);
  assert.equal(plan.days, 7, "every day of the week");
  assert.ok(plan.perDay >= 3, `perDay ${plan.perDay}: Wednesday's four events still hidden`);
  assert.ok(plan.zoom >= MIN_ROW_ZOOM, `zoom ${plan.zoom} below the readability floor`);
});

test("a busy week is listed only down to the floor, never below it", () => {
  const plan = planWeekRows([6, 6, 6, 6, 6, 6, 6], PORTRAIT_BOX);
  assert.ok(plan.zoom >= MIN_ROW_ZOOM, `zoom ${plan.zoom}`);
});

test("the operator's real week keeps all seven days", () => {
  // The first 2026-08-31 regression: events on five days convinced a
  // worst-case budget that only two days fit. The actual week is far cheaper
  // than that - not a five-day amputation. It shrinks further than it once
  // did on purpose: that is the card spending headroom it always had above
  // the floor on a full listing instead of hoarding type size.
  const plan = planWeekRows(REAL_WEEK, PORTRAIT_BOX);
  assert.equal(plan.days, 7);
  assert.equal(plan.hidden, 0);
  assert.ok(plan.zoom < 1 && plan.zoom >= MIN_ROW_ZOOM, `zoom ${plan.zoom}`);
});

test("below the readability floor, days drop from the tail and are counted", () => {
  const plan = planWeekRows(REAL_WEEK, 190 + FURNITURE_H);
  // At or above the floor, never below it - but not pinned TO the floor
  // either: the days that survive are re-fitted to the room they inherit.
  assert.ok(plan.zoom >= MIN_ROW_ZOOM, `zoom ${plan.zoom}`);
  assert.ok(plan.days >= 3, `only ${plan.days} days`);
  assert.equal(plan.days + plan.hidden, 7);
});

test("today always shows, whatever the arithmetic", () => {
  const plan = planWeekRows([6, 6, 6, 6, 6, 6, 6], 10);
  assert.equal(plan.days, 1);
});

test("a day's cost floors at the gutter and charges for the overflow line", () => {
  assert.ok(dayRowCost(0, 2) >= 16 + 34);
  assert.ok(dayRowCost(4, 2) > dayRowCost(2, 2), "an overflowing day costs its +n more line");
});

test("a '+1 more' line is never spent: the event is cheaper and says more", () => {
  // 3 shown + "+1 more" costs 138.3; all four shown costs 137.0. The summary
  // that hides exactly one event is the one summary never worth its own line.
  assert.equal(shownOn(4, 3), 4);
  assert.ok(dayRowCost(4, 3) < dayRowCost(3, 3) + 31.6);
  assert.equal(shownOn(5, 3), 3, "two or more hidden still earns a +n more line");
  assert.equal(shownOn(0, 3), 0);
  assert.equal(shownOn(2, 3), 2);
});

test("turning the text size up never makes the text smaller", () => {
  // The knob used to fight itself: raising it made the month band and footer
  // cost more of the card, which shrank the rows harder, so 1.2x rendered
  // SMALLER than 1.0x (15.3px against 16.4px) on the operator's board.
  const D = { w: 1300, h: 560 };
  for (const [w, h] of [
    [1000, 520],
    [1300, 560],
    [1000, 1200],
    [900, 700],
  ] as const) {
    let prev = 0;
    for (const f of [0.8, 1.0, 1.2, 1.4, 1.6, 2.0, 2.5]) {
      const auto = Math.min(4, Math.max(0.5, Math.sqrt((w * h) / (D.w * D.h))));
      const scale = auto * f;
      const plan = planWeekRows(REAL_WEEK, (h - 48) / scale, f);
      const rendered = ROW_EVENT_SIZE * scale * plan.zoom;
      assert.ok(
        rendered >= prev - 0.001,
        `${w}x${h} at ${f}x rendered ${rendered.toFixed(1)}px, down from ${prev.toFixed(1)}px`
      );
      prev = rendered;
    }
  }
});

test("the shrink floor rises with the text size, so big text stays big", () => {
  assert.equal(rowZoomFloor(1), MIN_ROW_ZOOM);
  assert.ok(rowZoomFloor(1.5) > MIN_ROW_ZOOM);
  assert.equal(rowZoomFloor(2), 1, "at 2x the rows do not shrink at all, days hide instead");
  assert.equal(rowZoomFloor(3), 1, "never above 1: the plan may shrink, never magnify");
});

test("the month band shrinks with the events, holding the designed proportion", () => {
  // The band used to sit outside the zoomed rows, so only the events shrank
  // under it: at the floor the wall showed a 61px month over 11px events, a
  // 5.5:1 ratio against the 3.4:1 the card was drawn at. One zoom over the
  // whole body means the ratio is fixed by construction, at every scale.
  const designed = MONTH_BAND_H / ROW_EVENT_SIZE;
  for (const box of [PORTRAIT_BOX, 300, 200 + FURNITURE_H, 1200]) {
    const plan = planWeekRows(REAL_WEEK, box);
    const band = MONTH_BAND_H * plan.zoom;
    const event = ROW_EVENT_SIZE * plan.zoom;
    assert.ok(Math.abs(band / event - designed) < 1e-9, `box ${box} skewed the proportion`);
  }
});

test("the whole card is costed, furniture included, so nothing overflows it", () => {
  for (const box of [PORTRAIT_BOX, 300, 400, 700, 1200]) {
    const plan = planWeekRows(REAL_WEEK, box);
    const used = FURNITURE_H + REAL_WEEK.slice(0, plan.days).reduce((s, n) => s + dayRowCost(n, plan.perDay), 0);
    assert.ok(used * plan.zoom <= box + 0.001, `box ${box}: needed ${(used * plan.zoom).toFixed(1)}`);
  }
});

test("the '+1 more' bargain is a fact about rows, and does not hold in a column", () => {
  // Rows: an event is one line (30.25) and the marker costs 31.6, so showing
  // it is cheaper. Columns: an event is two lines in a ~170px track (48.5)
  // against a marker's one, so the marker is cheaper and the columns path
  // must slice plainly. Getting this backwards overruns the column.
  assert.ok(MORE_LINE_H > ROW_EVENT_H, "rows: the marker costs more than the event it hides");
  assert.ok(COL_EVENT_H > MORE_LINE_H, "columns: the event costs more than the marker");
});

test("today lists every event it has, and the week behind it pays", () => {
  // Today is the day the household acts on; the rest is a preview of it. A
  // "+3 more" on today sends somebody to find a phone, which is the one thing
  // a wall calendar exists to prevent.
  const busyToday = [6, 2, 2, 2, 2, 2, 2];
  const plan = planWeekRows(busyToday, PORTRAIT_BOX);
  assert.equal(plan.today, 6, "today truncated");
  // And it is genuinely paid for: the card holds what it promised.
  const used =
    FURNITURE_H +
    busyToday.slice(0, plan.days).reduce((s, n, i) => s + dayRowCost(n, i === 0 ? plan.today : plan.perDay), 0);
  assert.ok(used * plan.zoom <= PORTRAIT_BOX + 0.001, `overflows by ${(used * plan.zoom - PORTRAIT_BOX).toFixed(1)}`);
});

test("a day too busy to render legibly on its own is still capped", () => {
  // "All of today's events" is a rule, not a suicide pact: twenty things on a
  // Tuesday must not shrink the whole card into a smear.
  const plan = planWeekRows([20, 1, 1, 1, 1, 1, 1], 260);
  assert.ok(plan.today < 20, `today ${plan.today} kept the card illegible`);
  assert.ok(plan.today >= 1);
});

test("a big text setting never shrinks the week below five days", () => {
  // The 2026-08-31 19:19 screenshot: a 1040x595 card at a 1.6x text setting
  // rendered TWO days and "+5 more days" over a fifth of a blank card. The
  // setting buys type size by showing less, and left ungoverned it will spend
  // the entire week to do it.
  const scale = Math.sqrt((1040 * 595) / (1300 * 560)) * 1.6;
  const plan = planWeekRows([1, 4, 3, 3, 2, 2, 1], (595 - 48) / scale, 1.6);
  assert.ok(plan.days >= MIN_DAYS_SHOWN, `only ${plan.days} days at 1.6x`);
  assert.ok(ROW_EVENT_SIZE * scale * plan.zoom >= 18, "and still readable across a room");
});

test("the minimum yields to a card that truly cannot hold it", () => {
  // Five days is what a calendar is for, but not at any price: a card with no
  // room shows fewer days rather than an illegible smear of all five.
  const plan = planWeekRows([6, 6, 6, 6, 6, 6, 6], 10);
  assert.equal(plan.days, 1);
  assert.ok(plan.zoom >= HARD_MIN_ZOOM || plan.days === 1);
});

test("hiding days never also leaves the card half empty", () => {
  // The operator's photo: four days dropped AND the rows shrunk to the floor,
  // so the card carried three short rows over a blank third of itself under a
  // footer apologising for the days it had just cut. Both degradations were
  // applied at once when only one was needed. Whatever survives the cut must
  // fill what it was given.
  for (const box of [PORTRAIT_BOX, 500, 400, 300, 250, 200]) {
    for (const f of [0.8, 1, 1.4, 2]) {
      const plan = planWeekRows(REAL_WEEK, box, f);
      const kept = REAL_WEEK.slice(0, plan.days);
      const used = (FURNITURE_H + kept.reduce((s, n) => s + dayRowCost(n, plan.perDay), 0)) * plan.zoom;
      assert.ok(used <= box + 0.001, `box ${box} @${f}x overflows: ${used.toFixed(1)}`);
      // Any shrink at all must be a shrink that was NEEDED: below 1 the kept
      // days fill the card exactly. Blank space is only ever what is left when
      // the content is already at its designed size and cannot grow past it.
      if (plan.zoom < 1) {
        assert.ok(
          used >= box - 0.001,
          `box ${box} @${f}x shrank to ${plan.zoom.toFixed(3)} yet left ${(box - used).toFixed(1)} units blank`
        );
      }
    }
  }
});

test("column capacity keeps room for the marker it causes", () => {
  // Capacity used to count only event lines, so the "+n more" that exists to
  // stop silent hiding was itself clipped by the column's overflow.
  const availH = 395; // landscape default, 1300x560
  const cap = columnCapacity(availH);
  assert.ok(COL_HEAD_H + cap * COL_EVENT_H + COL_MORE_H <= availH, `cap ${cap} leaves no room for the marker`);
  // A short card admits fewer rather than overrunning its track onto the footer.
  assert.ok(columnCapacity(200) < cap);
  assert.ok(columnCapacity(0) >= 1, "always at least one event");
  assert.equal(columnCapacity(Number.NaN), 1, "a NaN height must not blank every column");
});

test("an event is costed at the number of lines it is allowed to occupy", () => {
  // COL_EVENT_H costed two lines while EventLine clamped to three, so a column
  // of long titles dropped its last events with no marker at all.
  assert.equal(COL_EVENT_H, COL_EVENT_SIZE * 1.25 * COL_LINE_CLAMP + 6);
});
