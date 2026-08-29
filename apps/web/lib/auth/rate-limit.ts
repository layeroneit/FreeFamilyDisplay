/**
 * Fixed-window rate limiter, in-memory. Plan §8.1: limit login attempts by IP
 * and by target account, without leaking account existence.
 *
 * Design notes, earned the hard way (Phase 1a audit):
 * - REJECTED attempts are not recorded. A limiter that counts its own denials
 *   lets one request-per-minute hold the window open forever — a permanent
 *   lockout of the only operator account.
 * - Fixed window over sliding array: O(1) state per key (two numbers), no
 *   per-hit array filtering for an attacker to turn into event-loop CPU.
 * - The map is hard-capped. Keys are attacker-chosen (any email string), so
 *   unbounded growth is a memory DoS; on overflow the oldest entries evict.
 *
 * In-memory remains the right scope: one web container at family scale. If a
 * second replica ever exists this moves to Redis.
 */

type Window = { count: number; windowStart: number };

const MAX_KEYS = 10_000;

export type RateLimiter = {
  hit(key: string, now?: number): { limited: boolean; retryAfterMs: number };
  reset(): void;
};

export function createRateLimiter(maxAttempts: number, windowMs: number): RateLimiter {
  const windows = new Map<string, Window>();

  function evictIfNeeded(now: number): void {
    if (windows.size < MAX_KEYS) return;
    // First pass: drop expired windows.
    for (const [key, w] of windows) {
      if (now - w.windowStart >= windowMs) windows.delete(key);
    }
    // Still full (active attack with distinct keys): drop oldest insertions.
    // Map iterates in insertion order, so the front is the oldest.
    while (windows.size >= MAX_KEYS) {
      const oldest = windows.keys().next();
      if (oldest.done) break;
      windows.delete(oldest.value);
    }
  }

  return {
    hit(key: string, now: number = Date.now()) {
      const existing = windows.get(key);

      if (!existing || now - existing.windowStart >= windowMs) {
        evictIfNeeded(now);
        // Delete+set so a reused key moves to the back of insertion order.
        windows.delete(key);
        windows.set(key, { count: 1, windowStart: now });
        return { limited: false, retryAfterMs: 0 };
      }

      if (existing.count >= maxAttempts) {
        // Over the cap: report, and do NOT extend the window.
        return {
          limited: true,
          retryAfterMs: Math.max(0, existing.windowStart + windowMs - now),
        };
      }

      existing.count += 1;
      return { limited: false, retryAfterMs: 0 };
    },
    reset() {
      windows.clear();
    },
  };
}

/** 10 attempts per 15 minutes per IP; 5 per 15 minutes per target account. */
export const loginIpLimiter = createRateLimiter(10, 15 * 60 * 1000);
export const loginAccountLimiter = createRateLimiter(5, 15 * 60 * 1000);
