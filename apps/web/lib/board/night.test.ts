import assert from "node:assert/strict";
import test from "node:test";
import { NIGHT_FROM_DEFAULT, NIGHT_TO_DEFAULT, isNightAt, parseHHMM } from "./night";

const at = (h: number, m = 0) => new Date(2026, 8, 13, h, m);

test("parseHHMM accepts clock times and rejects everything else", () => {
  assert.equal(parseHHMM("22:00"), 22 * 60);
  assert.equal(parseHHMM("05:30"), 5 * 60 + 30);
  assert.equal(parseHHMM("00:00"), 0);
  assert.equal(parseHHMM("23:59"), 23 * 60 + 59);
  for (const bad of ["24:00", "22:60", "9:00", "2200", "", "night", "22:00:00", "-1:00"]) {
    assert.equal(parseHHMM(bad), null, bad);
  }
});

test("the default window wraps midnight correctly", () => {
  const night = (d: Date) => isNightAt(d, NIGHT_FROM_DEFAULT, NIGHT_TO_DEFAULT);
  assert.ok(night(at(22, 0)), "starts exactly at 22:00");
  assert.ok(night(at(23, 30)));
  assert.ok(night(at(0, 0)));
  assert.ok(night(at(3, 0)));
  assert.ok(night(at(5, 29)));
  assert.ok(!night(at(5, 30)), "ends exactly at 05:30 — the morning belongs to the widgets");
  assert.ok(!night(at(12, 0)));
  assert.ok(!night(at(21, 59)));
});

test("a same-day window works too", () => {
  assert.ok(isNightAt(at(2, 0), "01:00", "06:00"));
  assert.ok(!isNightAt(at(7, 0), "01:00", "06:00"));
  assert.ok(!isNightAt(at(0, 30), "01:00", "06:00"));
});

test("degenerate and malformed windows fail open to daytime", () => {
  assert.ok(!isNightAt(at(12, 0), "12:00", "12:00"), "from === to is never, not always");
  assert.ok(!isNightAt(at(23, 0), "bedtime", "05:30"));
  assert.ok(!isNightAt(at(23, 0), "22:00", "sunrise"));
});
