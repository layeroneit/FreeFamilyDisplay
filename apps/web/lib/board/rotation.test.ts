import assert from "node:assert/strict";
import test from "node:test";
import { clockIndex, CLOCK_ROTATION_MS, isClockRotation } from "./rotation";

test("only sub-daily rotations are clock-driven", () => {
  for (const r of ["EVERY_5_MIN", "EVERY_15_MIN", "EVERY_30_MIN", "HOURLY"] as const) {
    assert.equal(isClockRotation(r), true, r);
  }
  // The worker still owns these; a clock index for them would fight it.
  for (const r of ["DAILY", "WEEKLY", "MONTHLY", "MANUAL"] as const) {
    assert.equal(isClockRotation(r), false, r);
    assert.equal(clockIndex(r, 10, Date.now()), null, r);
  }
});

test("the index advances once per interval and wraps", () => {
  const step = CLOCK_ROTATION_MS.EVERY_5_MIN!;
  const t0 = 1_000 * step; // exactly on a boundary
  assert.equal(clockIndex("EVERY_5_MIN", 8, t0), 1000 % 8);
  // Anywhere inside the same window is the same image...
  assert.equal(clockIndex("EVERY_5_MIN", 8, t0 + step - 1), 1000 % 8);
  // ...and the next window is the next image.
  assert.equal(clockIndex("EVERY_5_MIN", 8, t0 + step), 1001 % 8);
  // It wraps rather than running off the end of the collection.
  assert.equal(clockIndex("EVERY_5_MIN", 8, t0 + 8 * step), 1000 % 8);
});

test("every display showing the same board agrees, and a reboot changes nothing", () => {
  // The whole point of deriving from the clock: two screens that started at
  // different times, and one that just restarted, all land on one image.
  const now = Date.parse("2026-08-30T21:17:33.412Z");
  const a = clockIndex("EVERY_15_MIN", 27, now);
  const b = clockIndex("EVERY_15_MIN", 27, now);
  assert.equal(a, b);
  // A refresh a few seconds later is still the same frame, not a restart at 0.
  assert.equal(clockIndex("EVERY_15_MIN", 27, now + 4_000), a);
});

test("intervals are the ones the editor offers, in ascending order", () => {
  assert.deepEqual(
    Object.values(CLOCK_ROTATION_MS),
    [5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000],
  );
});

test("an empty or fully-skipped collection yields no index rather than dividing by zero", () => {
  assert.equal(clockIndex("EVERY_5_MIN", 0, Date.now()), null);
  assert.equal(clockIndex("EVERY_5_MIN", -1, Date.now()), null);
  // A single image is a legitimate collection; it just never changes.
  assert.equal(clockIndex("EVERY_5_MIN", 1, Date.now()), 0);
});
