import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateSession,
  generateSessionToken,
  hashToken,
  SESSION_SLIDE_MIN_INTERVAL_MS,
  SESSION_TTL_MS,
} from "./session-token";
import { createRateLimiter } from "./rate-limit";
import { hashPassword, passwordMeetsPolicy, verifyPassword } from "./password";

// ---------------------------------------------------------------- tokens

test("session tokens are unique, url-safe, and 256-bit", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const t = generateSessionToken();
    assert.match(t, /^[A-Za-z0-9_-]+$/);
    assert.equal(Buffer.from(t, "base64url").length, 32);
    seen.add(t);
  }
  assert.equal(seen.size, 100);
});

test("hashToken is deterministic and one-way-shaped", () => {
  const t = generateSessionToken();
  assert.equal(hashToken(t), hashToken(t));
  assert.match(hashToken(t), /^[0-9a-f]{64}$/);
  assert.notEqual(hashToken(t), hashToken(t + "x"));
});

// ---------------------------------------------------------------- sessions

test("expired session is expired", () => {
  const now = new Date("2026-08-29T12:00:00Z");
  const r = evaluateSession(new Date(now.getTime() - 1), now, now);
  assert.equal(r.state, "expired");
});

test("a session expiring exactly now is expired (boundary)", () => {
  const now = new Date("2026-08-29T12:00:00Z");
  const r = evaluateSession(now, now, now);
  assert.equal(r.state, "expired");
});

test("fresh session does not slide; stale-but-valid session slides 90 days", () => {
  const now = new Date("2026-08-29T12:00:00Z");
  const expires = new Date(now.getTime() + 1000 * 60 * 60);

  const fresh = evaluateSession(expires, new Date(now.getTime() - 1000), now);
  assert.equal(fresh.state, "valid");
  assert.equal(fresh.state === "valid" && fresh.shouldSlide, false);

  const stale = evaluateSession(
    expires,
    new Date(now.getTime() - SESSION_SLIDE_MIN_INTERVAL_MS),
    now,
  );
  assert.equal(stale.state, "valid");
  if (stale.state === "valid") {
    assert.equal(stale.shouldSlide, true);
    assert.equal(stale.newExpiry.getTime(), now.getTime() + SESSION_TTL_MS);
  }
});

// ---------------------------------------------------------------- rate limit

test("limiter allows up to the cap, then limits with a sane retry hint", () => {
  const limiter = createRateLimiter(3, 1000);
  const t0 = 1_000_000;
  assert.equal(limiter.hit("ip", t0).limited, false);
  assert.equal(limiter.hit("ip", t0 + 10).limited, false);
  assert.equal(limiter.hit("ip", t0 + 20).limited, false);
  const fourth = limiter.hit("ip", t0 + 30);
  assert.equal(fourth.limited, true);
  assert.ok(fourth.retryAfterMs > 0 && fourth.retryAfterMs <= 1000);
});

test("rejected attempts do not extend the window — no permanent lockout", () => {
  // The audit's lockout scenario: trip the limiter, then poke once a minute.
  // With denials not recorded, the window expires on wall clock and the
  // legitimate user gets back in.
  const limiter = createRateLimiter(2, 60_000);
  const t0 = 5_000_000;
  limiter.hit("acct", t0);
  limiter.hit("acct", t0 + 10);
  for (let i = 1; i <= 100; i++) {
    limiter.hit("acct", t0 + i * 500); // attacker keeps poking inside the window
  }
  // One window after the FIRST attempt, the key is clean again.
  assert.equal(limiter.hit("acct", t0 + 60_001).limited, false);
});

test("honoring retry-after actually clears the limit", () => {
  const limiter = createRateLimiter(1, 1000);
  const t0 = 7_000_000;
  limiter.hit("k", t0);
  const denied = limiter.hit("k", t0 + 100);
  assert.equal(denied.limited, true);
  // Waiting exactly the advertised time must succeed — a client that obeys
  // Retry-After and still gets 429 will retry-storm forever.
  assert.equal(limiter.hit("k", t0 + 100 + denied.retryAfterMs).limited, false);
});

test("limiter keys are independent", () => {
  const limiter = createRateLimiter(1, 1000);
  const t0 = 9_000_000;
  assert.equal(limiter.hit("a", t0).limited, false);
  assert.equal(limiter.hit("b", t0).limited, false);
  assert.equal(limiter.hit("a", t0 + 1).limited, true);
  assert.equal(limiter.hit("b", t0 + 1).limited, true);
});

test("limiter map is hard-capped — attacker-chosen keys cannot exhaust memory", () => {
  const limiter = createRateLimiter(5, 60_000);
  const t0 = 11_000_000;
  // Well past the cap; if unbounded this would hold 30k live windows.
  for (let i = 0; i < 30_000; i++) {
    limiter.hit(`acct:attacker-${i}@x.com`, t0 + i);
  }
  // Functional check: a fresh key still works and an early key was evicted
  // (its window is gone, so it starts clean rather than limited).
  assert.equal(limiter.hit("acct:fresh@x.com", t0 + 30_001).limited, false);
  assert.equal(limiter.hit("acct:attacker-0@x.com", t0 + 30_002).limited, false);
});

// ---------------------------------------------------------------- passwords

test("password roundtrip verifies; wrong password does not", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("correct horse battery stable", hash), false);
});

test("null stored hash always fails but still does work (dummy compare)", async () => {
  // ADR 0003 / §8.1: an account with no password must be indistinguishable
  // from a wrong password. We can't assert timing in a unit test, but we can
  // assert the result and that the code path doesn't throw.
  assert.equal(await verifyPassword("anything at all here", null), false);
});

test("password policy: length only", () => {
  assert.equal(passwordMeetsPolicy("short"), false);
  assert.equal(passwordMeetsPolicy("exactly12chr"), true);
  assert.equal(passwordMeetsPolicy("a".repeat(129)), false);
  // No composition rules: a long lowercase phrase is fine.
  assert.equal(passwordMeetsPolicy("the kitchen tablet is on the wall"), true);
});
