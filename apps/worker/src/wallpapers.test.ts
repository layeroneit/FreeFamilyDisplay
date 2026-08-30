import assert from "node:assert/strict";
import test from "node:test";
import { isDue, lastBoundary, pickNext } from "./wallpapers.ts";

test("weekly boundary is the most recent Monday 04:00", () => {
  // Wed 2026-09-02 10:00 local → boundary Mon 2026-08-31 04:00
  const now = new Date(2026, 8, 2, 10, 0, 0);
  const b = lastBoundary("WEEKLY", now)!;
  assert.equal(b.getDay(), 1);
  assert.equal(b.getHours(), 4);
  assert.equal(b.getDate(), 31);
  // Mon 03:59 → previous Monday
  const early = new Date(2026, 7, 31, 3, 59, 0);
  assert.equal(lastBoundary("WEEKLY", early)!.getDate(), 24);
});

test("daily and monthly boundaries; manual never due", () => {
  const now = new Date(2026, 8, 15, 12, 0, 0);
  assert.equal(lastBoundary("DAILY", now)!.getDate(), 15);
  assert.equal(lastBoundary("DAILY", new Date(2026, 8, 15, 2, 0, 0))!.getDate(), 14);
  assert.equal(lastBoundary("MONTHLY", now)!.getDate(), 1);
  assert.equal(lastBoundary("MANUAL", now), null);
  assert.equal(isDue("MANUAL", null, now), false);
});

test("weekly rotation advances exactly once per week across a simulated month", () => {
  let last: Date | null = null;
  let rotations = 0;
  const start = new Date(2026, 8, 1, 0, 0, 0); // Tue Sep 1
  for (let h = 0; h < 24 * 31; h++) {
    const now = new Date(start.getTime() + h * 3_600_000);
    if (isDue("WEEKLY", last, now)) {
      rotations++;
      last = now;
    }
  }
  // Sep 1 (never rotated → due immediately), then Mondays Sep 7, 14, 21, 28.
  assert.equal(rotations, 5);
});

test("sequential order cycles in sortOrder and wraps", () => {
  const c = [{ id: "b", sortOrder: 1 }, { id: "a", sortOrder: 0 }, { id: "c", sortOrder: 2 }];
  assert.equal(pickNext(c, null, "SEQUENTIAL", []).id, "a");
  assert.equal(pickNext(c, "a", "SEQUENTIAL", []).id, "b");
  assert.equal(pickNext(c, "c", "SEQUENTIAL", []).id, "a");
});

test("shuffle shows every wallpaper once before repeating", () => {
  const c = [{ id: "a", sortOrder: 0 }, { id: "b", sortOrder: 1 }, { id: "c", sortOrder: 2 }, { id: "d", sortOrder: 3 }];
  let shown: string[] = [];
  let current: string | null = null;
  const seen: string[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 4; i++) {
    const r = pickNext(c, current, "SHUFFLE", shown, rnd);
    seen.push(r.id!);
    shown = r.shown;
    current = r.id;
  }
  assert.deepEqual([...seen].sort(), ["a", "b", "c", "d"]);
  // Fifth pick starts a fresh cycle and never repeats the one currently up.
  const r5 = pickNext(c, current, "SHUFFLE", shown, rnd);
  assert.notEqual(r5.id, current);
  assert.equal(r5.shown.length, 1);
});

test("skipped/empty sets are handled", () => {
  assert.equal(pickNext([], "x", "SHUFFLE", []).id, null);
  assert.equal(pickNext([{ id: "only", sortOrder: 0 }], "only", "SHUFFLE", ["only"]).id, "only");
});
