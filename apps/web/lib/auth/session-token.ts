/**
 * Session token primitives. Pure functions — no database, no framework —
 * so they are directly unit-testable (security-critical per CLAUDE.md).
 *
 * Model: the browser cookie holds a random 256-bit token; the database stores
 * only its SHA-256 hash (plan §8.1 "token hygiene" — a leaked DB dump must not
 * contain usable credentials). Rolling expiry slides the window forward on use.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "ffd_session";

/** 90-day rolling sessions (plan §8.1). */
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Refresh the DB row at most this often. Sliding on every request would write
 * to Postgres on every page view for no security benefit.
 */
export const SESSION_SLIDE_MIN_INTERVAL_MS = 60 * 60 * 1000;

export function generateSessionToken(): string {
  // base64url: cookie-safe, no padding.
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

export type SessionFreshness =
  | { state: "expired" }
  | { state: "valid"; shouldSlide: boolean; newExpiry: Date };

/**
 * Given a session row's timestamps, decide whether it is still valid and
 * whether the rolling window should slide forward now.
 */
export function evaluateSession(
  expiresAt: Date,
  lastSeenAt: Date,
  now: Date = new Date(),
): SessionFreshness {
  if (expiresAt.getTime() <= now.getTime()) return { state: "expired" };
  const shouldSlide = now.getTime() - lastSeenAt.getTime() >= SESSION_SLIDE_MIN_INTERVAL_MS;
  return { state: "valid", shouldSlide, newExpiry: new Date(now.getTime() + SESSION_TTL_MS) };
}
