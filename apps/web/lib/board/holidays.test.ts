import assert from "node:assert/strict";
import test from "node:test";
import { HOLIDAYS, activeHoliday, easterSunday } from "./holidays";

function holiday(id: string) {
  const h = HOLIDAYS.find((x) => x.id === id);
  assert.ok(h, `holiday ${id} exists`);
  return h;
}

/** The calendar date of a Date, for readable assertions. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test("Easter computus against known dates", () => {
  // Four years spanning a March Easter, two April ones, and a leap year —
  // if the computus is off it is usually off by a lunation, not a day.
  assert.equal(ymd(easterSunday(2024)), "2024-03-31");
  assert.equal(ymd(easterSunday(2025)), "2025-04-20");
  assert.equal(ymd(easterSunday(2026)), "2026-04-05");
  assert.equal(ymd(easterSunday(2027)), "2027-03-28");
});

test("movable feasts land on the right weekday-of-month", () => {
  const tg = holiday("thanksgiving").window(2026);
  assert.equal(ymd(tg.end), "2026-11-26"); // fourth Thursday
  assert.equal(ymd(tg.start), "2026-11-16"); // ten days of lead-up
  const sb = holiday("super-bowl").window(2026);
  assert.equal(ymd(sb.end), "2026-02-08"); // second Sunday
  assert.equal(ymd(sb.start), "2026-02-03");
});

test("windows are sane in shape", () => {
  for (const h of HOLIDAYS) {
    const { start, end } = h.window(2026);
    assert.ok(start.getTime() < end.getTime(), h.id);
    const days = (end.getTime() - start.getTime()) / 86_400_000;
    assert.ok(days >= 3 && days <= 26, `${h.id}: ${days} days`);
    // Inclusive through the last millisecond of the holiday itself.
    assert.equal(end.getHours(), 23, h.id);
    assert.equal(end.getMilliseconds(), 999, h.id);
  }
});

test("inside and outside a window", () => {
  assert.equal(activeHoliday(new Date(2026, 9, 20))?.id, "halloween");
  assert.equal(activeHoliday(new Date(2026, 9, 17))?.id, "halloween"); // first day of lead-up
  assert.equal(activeHoliday(new Date(2026, 9, 31, 23, 59))?.id, "halloween"); // the night itself
  assert.equal(activeHoliday(new Date(2026, 9, 16, 12)), null); // the day before the window
  assert.equal(activeHoliday(new Date(2026, 10, 1)), null); // the day after Halloween
  // A plain end-of-summer day sits in no window at all.
  assert.equal(activeHoliday(new Date(2026, 7, 31)), null);
});

test("the New Year window crosses the year boundary", () => {
  assert.equal(activeHoliday(new Date(2026, 11, 29))?.id, "new-years");
  assert.equal(activeHoliday(new Date(2026, 11, 31, 23, 30))?.id, "new-years");
  assert.equal(activeHoliday(new Date(2027, 0, 1, 8))?.id, "new-years");
  // Christmas hands over cleanly: Dec 26-28 belong to nobody.
  assert.equal(activeHoliday(new Date(2026, 11, 25))?.id, "christmas");
  assert.equal(activeHoliday(new Date(2026, 11, 26)), null);
  assert.equal(activeHoliday(new Date(2026, 11, 28, 23, 59)), null);
  assert.equal(activeHoliday(new Date(2027, 0, 2)), null);
  const xmas = holiday("christmas").window(2026);
  const ny = holiday("new-years").window(2027);
  assert.ok(xmas.end.getTime() < ny.start.getTime(), "Christmas and New Year windows do not overlap");
});

test("nearest end wins on overlap", () => {
  // Real overlap: every February the Super Bowl lead-up sits inside
  // Valentine's week. On the shared days the sooner-ending holiday wins,
  // and Valentine's takes the stage back the day after the game.
  assert.equal(activeHoliday(new Date(2026, 1, 7))?.id, "super-bowl");
  assert.equal(activeHoliday(new Date(2026, 1, 8))?.id, "super-bowl");
  assert.equal(activeHoliday(new Date(2026, 1, 9))?.id, "valentines");
  assert.equal(activeHoliday(new Date(2026, 1, 14, 20))?.id, "valentines");

  // Synthetic sweep: on every day of 2026, whatever activeHoliday returns
  // must be exactly the sooner-ending of ALL windows containing that day —
  // recomputed here by brute force, so the two implementations can only
  // agree if the nearest-end rule really holds everywhere.
  for (let day = 0; day < 365; day++) {
    const d = new Date(2026, 0, 1 + day, 12);
    const containing = HOLIDAYS.flatMap((h) =>
      [d.getFullYear(), d.getFullYear() + 1]
        .map((y) => ({ id: h.id, ...h.window(y) }))
        .filter((w) => d.getTime() >= w.start.getTime() && d.getTime() <= w.end.getTime()),
    );
    const want = containing.reduce<{ id: string; end: Date } | null>(
      (best, w) => (best && best.end.getTime() <= w.end.getTime() ? best : w),
      null,
    );
    assert.equal(activeHoliday(d)?.id ?? null, want?.id ?? null, ymd(d));
  }
});

test("every holiday has decor to draw", () => {
  assert.ok(HOLIDAYS.length >= 9);
  for (const h of HOLIDAYS) {
    assert.ok(h.id && h.label, h.id);
    assert.ok(h.glyphs.length >= 2, h.id);
    assert.ok(h.palette.length >= 4, h.id);
    for (const c of h.palette) assert.match(c, /^#[0-9A-Fa-f]{6}$/, h.id);
    for (const g of h.glyphs) {
      assert.ok(g.paths?.length || g.circles?.length || g.detail, `${h.id}/${g.name}`);
    }
  }
});
