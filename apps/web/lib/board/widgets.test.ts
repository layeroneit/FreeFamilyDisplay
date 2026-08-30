import assert from "node:assert/strict";
import test from "node:test";
import {
  CANVAS_H,
  CANVAS_W,
  GRID,
  normalizeGeometry,
  parseWidgetConfig,
  safeWidgetConfig,
  STARTER_LAYOUT,
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
  assert.deepEqual(parseWidgetConfig("clock", {}), { format: "12h", showSeconds: false, style: "digital" });
  assert.deepEqual(parseWidgetConfig("weather", { location: "  Oslo " }), { location: "Oslo", units: "f" });
  assert.throws(() => parseWidgetConfig("weather", { location: "" }));
  assert.throws(() => parseWidgetConfig("clock", { format: "13h" }));
  assert.throws(() => parseWidgetConfig("notes", { text: "x".repeat(2001) }));
});

test("safeWidgetConfig never throws on a corrupt row", () => {
  assert.deepEqual(safeWidgetConfig("clock", { format: "nope" }), { format: "12h", showSeconds: false, style: "digital" });
  assert.deepEqual(safeWidgetConfig("quote", null), {});
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
