import assert from "node:assert/strict";
import test from "node:test";
import {
  COL_EVENT_H,
  FURNITURE_H,
  MAX_PER_DAY,
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

test("a quiet week spends its spare height on events, not on white space", () => {
  // The regression this pass is about: perDay came from an equal seven-way
  // split of the card, which concluded ONE event per day on every board at
  // every text size - so a Wednesday with three things on it read "Soccer"
  // and "+2 more". Rows are auto-sized; a quiet Tuesday's height belongs to
  // Wednesday.
  const plan = planWeekRows([0, 1, 0, 1, 0, 0, 0], PORTRAIT_BOX);
  assert.equal(plan.perDay, MAX_PER_DAY);
});

test("the operator's real week keeps all seven days by shrinking a little", () => {
  // The first 2026-08-31 regression: events on five days convinced a
  // worst-case budget that only two days fit. The actual week is far cheaper
  // than that - a few percent of shrink, not a five-day amputation.
  const plan = planWeekRows(REAL_WEEK, PORTRAIT_BOX);
  assert.equal(plan.days, 7);
  assert.equal(plan.hidden, 0);
  assert.ok(plan.zoom < 1 && plan.zoom > 0.9, `zoom ${plan.zoom}`);
});

test("below the readability floor, days drop from the tail and are counted", () => {
  const plan = planWeekRows(REAL_WEEK, 190 + FURNITURE_H);
  assert.equal(plan.zoom, MIN_ROW_ZOOM);
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

test("column capacity fills a tall card and gives up lines on a short one", () => {
  // Landscape default (1300x560) leaves ~395 units for the columns.
  assert.equal(columnCapacity(395), MAX_PER_DAY);
  // A short card admits fewer rather than overrunning its track onto the footer.
  assert.ok(columnCapacity(200) < MAX_PER_DAY);
  assert.ok(columnCapacity(0) >= 1, "always at least one event");
});
