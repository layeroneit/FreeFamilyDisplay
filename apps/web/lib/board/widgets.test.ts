import assert from "node:assert/strict";
import test from "node:test";
import {
  CANVAS_H,
  CANVAS_W,
  freeGeometry,
  GRID,
  normalizeGeometry,
  parseWidgetConfig,
  safeWidgetConfig,
  STARTER_LAYOUT,
  STARTER_LAYOUTS,
  WIDGET_META,
  WIDGET_TYPES,
} from "./widgets";

test("every widget type has meta and a starter position inside the canvas", () => {
  for (const t of WIDGET_TYPES) {
    const m = WIDGET_META[t];
    const g = STARTER_LAYOUT[t];
    assert.ok(m.label.length > 0, t);
    assert.ok(g.x >= 0 && g.y >= 0 && g.x + g.w <= CANVAS_W && g.y + g.h <= CANVAS_H, `${t} starter out of bounds`);
    assert.ok(g.w >= m.minSize.w && g.h >= m.minSize.h, `${t} starter below min size`);
    assert.equal(g.x % GRID, 0);
    assert.equal(g.y % GRID, 0);
  }
});

test("config parsing fills defaults and rejects garbage", () => {
  assert.deepEqual(parseWidgetConfig("clock", {}), { format: "12h", showSeconds: false, style: "digital", fontScale: 1 });
  assert.deepEqual(parseWidgetConfig("weather", { location: "  Oslo " }), { location: "Oslo", units: "f", view: "detailed", fontScale: 1 });
  assert.throws(() => parseWidgetConfig("weather", { location: "" }));
  assert.throws(() => parseWidgetConfig("clock", { format: "13h" }));
  assert.throws(() => parseWidgetConfig("notes", { text: "x".repeat(2001) }));
});

test("safeWidgetConfig never throws on a corrupt row", () => {
  assert.deepEqual(safeWidgetConfig("clock", { format: "nope" }), { format: "12h", showSeconds: false, style: "digital", fontScale: 1 });
  assert.deepEqual(safeWidgetConfig("quote", null), { fontScale: 1 });
  assert.throws(() => parseWidgetConfig("quote", { fontScale: 9 }));
});

test("normalizeGeometry snaps, clamps, and enforces minimum size", () => {
  const g = normalizeGeometry("clock", { x: 1905, y: 1075, w: 10, h: 10, z: 5 });
  assert.equal(g.w, WIDGET_META.clock.minSize.w);
  assert.equal(g.h, WIDGET_META.clock.minSize.h);
  assert.equal(g.x + g.w <= CANVAS_W, true);
  assert.equal(g.y + g.h <= CANVAS_H, true);
  assert.equal(g.x % GRID, 0);
  const neg = normalizeGeometry("notes", { x: -50, y: -50, w: 5000, h: 5000, z: -3 });
  assert.deepEqual([neg.x, neg.y, neg.w, neg.h, neg.z], [0, 0, CANVAS_W, CANVAS_H, 0]);
});

test("freeGeometry places deliberately and declines a full board", () => {
  const hits = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  // Empty board: the designed starter slot, verbatim.
  assert.deepEqual(freeGeometry("scores", [], "LANDSCAPE"), STARTER_LAYOUTS.LANDSCAPE.scores);

  // The starter slot taken (photos lives in the same rectangle): the answer
  // is somewhere else, inside the canvas, covering nothing.
  const photos = [{ ...STARTER_LAYOUTS.LANDSCAPE.photos }];
  const g = freeGeometry("scores", photos, "LANDSCAPE");
  assert.ok(g);
  assert.ok(g.x >= 0 && g.y >= 0 && g.x + g.w <= CANVAS_W && g.y + g.h <= CANVAS_H);
  assert.ok(!photos.some((e) => hits(g, e)));

  // The full starter board has NO free rectangle on any canvas — that is a
  // fact this function must report as null (the API route then falls back to
  // the designed slot, deliberately over photos, never over the calendar).
  // Asserted exactly, because a conditional version of this test executed
  // zero assertions and the audit caught it passing vacuously.
  for (const preset of ["LANDSCAPE", "PORTRAIT", "ULTRAWIDE"] as const) {
    const starterBoard = (["greeting", "clock", "date", "weather", "calendar", "photos", "quote"] as const).map(
      (t) => STARTER_LAYOUTS[preset][t],
    );
    assert.equal(freeGeometry("scores", starterBoard, preset), null, preset);
  }
});
