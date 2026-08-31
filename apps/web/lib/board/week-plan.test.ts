import assert from "node:assert/strict";
import test from "node:test";
import { MIN_ROW_ZOOM, dayRowCost, planWeekRows } from "./week-plan";

/** The default portrait calendar's rows area, in its own zoomed units. */
const PORTRAIT_AVAIL = (520 - 48) / 0.845 - 87 - 30; // ≈ 441

test("a quiet week shows all seven days at full size", () => {
  const plan = planWeekRows([0, 1, 0, 1, 0, 0, 0], 1, PORTRAIT_AVAIL);
  assert.deepEqual(plan, { days: 7, zoom: 1, hidden: 0 });
});

test("the operator's real week keeps all seven days by shrinking a little", () => {
  // The 2026-08-31 regression: events on five days convinced a worst-case
  // budget that only two days fit. The actual week costs ~461 against ~441 -
  // a four-percent shrink, not a five-day amputation.
  const plan = planWeekRows([0, 3, 3, 4, 3, 1, 0], 1, PORTRAIT_AVAIL);
  assert.equal(plan.days, 7);
  assert.equal(plan.hidden, 0);
  assert.ok(plan.zoom < 1 && plan.zoom > 0.9, `zoom ${plan.zoom}`);
});

test("below the readability floor, days drop from the tail and are counted", () => {
  // A huge text-size multiplier leaves ~190 units for the rows.
  const plan = planWeekRows([0, 3, 3, 4, 3, 1, 0], 1, 190);
  assert.equal(plan.zoom, MIN_ROW_ZOOM);
  assert.ok(plan.days >= 3, `only ${plan.days} days`);
  assert.equal(plan.days + plan.hidden, 7);
});

test("today always shows, whatever the arithmetic", () => {
  const plan = planWeekRows([6, 6, 6, 6, 6, 6, 6], 6, 10);
  assert.equal(plan.days, 1);
});

test("a day's cost floors at the gutter and charges for the overflow line", () => {
  assert.equal(dayRowCost(0, 2), dayRowCost(1, 2) < dayRowCost(0, 2) ? NaN : dayRowCost(0, 2));
  assert.ok(dayRowCost(0, 2) >= 16 + 34);
  assert.ok(dayRowCost(3, 2) > dayRowCost(2, 2), "an overflowing day costs its +n more line");
});
