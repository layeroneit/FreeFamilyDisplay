/**
 * Sub-daily wallpaper rotation, derived from the wall clock.
 *
 * The worker advances a pointer in the database on a 4am boundary. That is the
 * right shape for "a new week greets people at breakfast" and the wrong shape
 * for "change every five minutes": it would mean a write per board per
 * interval, a rotation that stalls whenever the worker is busy, and screens
 * showing the same board drifting out of step with each other.
 *
 * Deriving the index from the clock costs nothing, keeps every display in step
 * because they all read the same clock, and lands on the right image after a
 * refresh, a crash, or a reboot rather than restarting from the first one. It
 * is the same trick the photo slideshow uses.
 *
 * Kept free of `server-only` and of Prisma so it stays a pure function the
 * ordinary test run can reach.
 */

import type { WallpaperRotation } from "@ffd/db";

/**
 * The board reloads every five minutes (`RefreshTimer` on the kiosk and view
 * pages), so five minutes is the floor at which a change is actually visible.
 * Anything shorter would only be observed on a manual reload.
 */
export const CLOCK_ROTATION_MS: Partial<Record<WallpaperRotation, number>> = {
  EVERY_5_MIN: 5 * 60_000,
  EVERY_15_MIN: 15 * 60_000,
  EVERY_30_MIN: 30 * 60_000,
  HOURLY: 60 * 60_000,
};

/** True when this rotation is driven by the clock rather than by the worker. */
export function isClockRotation(rotation: WallpaperRotation): boolean {
  return CLOCK_ROTATION_MS[rotation] !== undefined;
}

/**
 * Which image a clock-driven rotation is showing at `now`, or null when the
 * rotation is worker-driven or the collection is empty.
 */
export function clockIndex(rotation: WallpaperRotation, count: number, now: number): number | null {
  const ms = CLOCK_ROTATION_MS[rotation];
  if (ms === undefined || count <= 0) return null;
  return Math.floor(now / ms) % count;
}
