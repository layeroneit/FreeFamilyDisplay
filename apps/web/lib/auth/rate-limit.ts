/**
 * Sliding-window rate limiter, in-memory. Plan §8.1: limit login attempts by
 * IP and by target account, and never leak account existence through timing
 * or response differences.
 *
 * In-memory is a deliberate fit for this deployment: exactly one web container
 * (family scale), so shared state across instances is not a requirement. If a
 * second web replica ever exists, this moves to Redis — but web currently has
 * no Redis dependency by design (§4.2), so don't add one for a limiter with
 * one consumer.
 */

type Window = { timestamps: number[] };

export type RateLimiter = {
  /** Records an attempt and reports whether the caller is now over the limit. */
  hit(key: string, now?: number): { limited: boolean; retryAfterMs: number };
  /** Test/ops hook. */
  reset(): void;
};

export function createRateLimiter(maxAttempts: number, windowMs: number): RateLimiter {
  const windows = new Map<string, Window>();
  // Opportunistic GC so an attacker cycling keys can't grow the map forever.
  let lastSweep = 0;

  function sweep(now: number): void {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, w] of windows) {
      const cutoff = now - windowMs;
      w.timestamps = w.timestamps.filter((t) => t > cutoff);
      if (w.timestamps.length === 0) windows.delete(key);
    }
  }

  return {
    hit(key: string, now: number = Date.now()) {
      sweep(now);
      const cutoff = now - windowMs;
      const w = windows.get(key) ?? { timestamps: [] };
      w.timestamps = w.timestamps.filter((t) => t > cutoff);
      w.timestamps.push(now);
      windows.set(key, w);

      if (w.timestamps.length <= maxAttempts) {
        return { limited: false, retryAfterMs: 0 };
      }
      const oldest = w.timestamps[0] ?? now;
      return { limited: true, retryAfterMs: Math.max(0, oldest + windowMs - now) };
    },
    reset() {
      windows.clear();
    },
  };
}

/** 10 attempts per 15 minutes per IP; 5 per 15 minutes per target account. */
export const loginIpLimiter = createRateLimiter(10, 15 * 60 * 1000);
export const loginAccountLimiter = createRateLimiter(5, 15 * 60 * 1000);
