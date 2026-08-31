import assert from "node:assert/strict";
import test from "node:test";
import { PETAL_GLYPH, SEASON_DECOR, SEASONS, seasonFor, seasonalFall } from "./season";

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
  assert.ok(PETAL_GLYPH.paths?.length, "the loose petal exists");
});

test("falling pieces stay inside the card and inside their season", () => {
  for (const s of SEASONS) {
    const w = 1126;
    const h = 558;
    const pieces = seasonalFall(s, w, h);
    // Fall runs as few as 7 statement leaves by design.
    assert.ok(pieces.length >= 6 && pieces.length <= 22, `${s}: ${pieces.length} pieces`);
    for (const p of pieces) {
      assert.ok(p.x >= 0 && p.x <= w, `${s}: x ${p.x}`);
      assert.ok(p.size > 0 && p.size <= 80, `${s}: size ${p.size}`);
      assert.ok(p.dur > 0 && p.delay >= 0, `${s}: timing`);
      if (p.kind === "glyph") {
        // -1 is the loose petal; anything else must be a real glyph index.
        assert.ok(p.glyph >= -1 && p.glyph < SEASON_DECOR[s].glyphs.length, `${s}: glyph ${p.glyph}`);
        assert.ok(p.opacity > 0 && p.opacity < 1, `${s}: opacity`);
      } else {
        assert.ok(p.y >= 0 && p.y <= h, `${s}: firefly y ${p.y}`);
      }
      assert.ok(p.flutterDur > 0, `${s}: flutter`);
    }
  }
});

test("one wind per card - every faller leans the same way", () => {
  for (const s of ["fall", "winter", "spring"] as const) {
    const signs = new Set(seasonalFall(s, 1126, 558).map((p) => Math.sign(p.drift)));
    assert.equal(signs.size, 1, `${s}: mixed wind directions`);
  }
});

test("the wind never carries a piece off the card", () => {
  for (const s of ["fall", "winter", "spring"] as const) {
    for (const p of seasonalFall(s, 1126, 558)) {
      assert.ok(p.x >= 0 && p.x + p.size <= 1126, `${s}: starts on the card`);
      const end = p.x + p.drift;
      assert.ok(end >= 0 && end + p.size <= 1126, `${s}: lands on the card (x ${p.x} drift ${p.drift} size ${p.size})`);
    }
  }
});

test("summer glows in place; the other seasons fall", () => {
  assert.ok(seasonalFall("summer", 1126, 558).every((p) => p.kind === "firefly"));
  for (const s of ["fall", "winter", "spring"] as const) {
    assert.ok(seasonalFall(s, 1126, 558).every((p) => p.kind === "glyph"), s);
  }
  // Spring mostly drops loose petals, not whole flowers.
  const petals = seasonalFall("spring", 1126, 558).filter((p) => p.glyph === -1).length;
  assert.ok(petals >= 3, `only ${petals} petals`);
});

test("the same card animates identically every render", () => {
  // A five-minute refresh must resume the sky, not reshuffle it.
  assert.deepEqual(seasonalFall("winter", 1126, 558), seasonalFall("winter", 1126, 558));
  assert.notDeepEqual(seasonalFall("winter", 1126, 558), seasonalFall("fall", 1126, 558));
});
