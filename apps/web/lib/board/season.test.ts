import assert from "node:assert/strict";
import test from "node:test";
import { SEASON_DECOR, SEASONS, seasonFor, seasonalFrame } from "./season";

test("meteorological seasons, month by month", () => {
  const want = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "fall", "fall", "fall", "winter"] as const;
  for (let m = 0; m < 12; m++) assert.equal(seasonFor(new Date(2026, m, 15)), want[m], `month ${m}`);
  // Boundaries, not just mid-month.
  assert.equal(seasonFor(new Date(2026, 8, 1)), "fall");
  assert.equal(seasonFor(new Date(2026, 10, 30)), "fall");
});

test("every season has decor to draw", () => {
  for (const s of SEASONS) {
    const d = SEASON_DECOR[s];
    assert.ok(d.glyphs.length >= 3, s);
    assert.ok(d.palette.length >= 3, s);
    for (const g of d.glyphs) assert.ok(g.paths?.length || g.circles?.length || g.detail, `${s}/${g.name}`);
  }
});

test("decor stays on the edges and off the widgets", () => {
  for (const [w, h] of [[1920, 1080], [1080, 1920], [2560, 1080]] as const) {
    const band = Math.min(w, h) * 0.075;
    const pieces = seasonalFrame("fall", w, h);
    assert.ok(pieces.length >= 20, `${w}x${h} count`);
    for (const p of pieces) {
      const cx = p.x + p.size / 2;
      const cy = p.y + p.size / 2;
      const onEdge = cx <= band || cx >= w - band || cy <= band || cy >= h - band;
      assert.ok(onEdge, `piece centred at ${cx},${cy} on ${w}x${h} is in the middle of the board`);
      assert.ok(p.glyph >= 0 && p.glyph < SEASON_DECOR.fall.glyphs.length);
      assert.ok(p.opacity > 0 && p.opacity < 1);
    }
  }
});

test("the same board lays out identically every render", () => {
  // A five-minute refresh must not teleport the leaves.
  assert.deepEqual(seasonalFrame("winter", 1920, 1080), seasonalFrame("winter", 1920, 1080));
  assert.notDeepEqual(seasonalFrame("winter", 1920, 1080), seasonalFrame("spring", 1920, 1080));
});
