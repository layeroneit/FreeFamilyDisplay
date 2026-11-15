import assert from "node:assert/strict";
import test from "node:test";
import { DISPLAY_COOKIE, displayCookieName, displayTokensFrom } from "./display-cookie";

const A = "A".repeat(43);
const B = "B".repeat(43);

test("each board token gets its own cookie, so a second tab or a stale link cannot replace it (L8)", async () => {
  const a = await displayCookieName(A);
  const b = await displayCookieName(B);
  assert.notEqual(a, b);
  assert.equal(a, await displayCookieName(A), "stable per token");
  assert.ok(a.startsWith(`${DISPLAY_COOKIE}_`));
  assert.ok(!a.includes(A.slice(0, 8)), "the name does not leak the token");
});

test("every well-formed display cookie is offered to the media check, the legacy one included", () => {
  const tokens = displayTokensFrom([
    { name: "ffd_display_0123456789ab", value: A },
    { name: DISPLAY_COOKIE, value: B },
    { name: "ffd_display_ffffffffffff", value: "not-a-token" },
    { name: "session", value: A },
  ]);
  assert.deepEqual(tokens.sort(), [A, B].sort());
});

test("a flood of display cookies is bounded", () => {
  const many = Array.from({ length: 100 }, (_, i) => ({ name: `ffd_display_${i.toString(16).padStart(12, "0")}`, value: `${i}`.padStart(43, "x") }));
  assert.ok(displayTokensFrom(many).length <= 16);
});
