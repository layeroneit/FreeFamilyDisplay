/**
 * Night mode — "a nightlight type of thing" (operator, 2026-09-13): inside
 * the window, the board sheds every widget and every overlay and gives the
 * room to the wallpaper alone.
 *
 * Pure date arithmetic in the household's own wall clock, in the season.ts
 * mold: no server-only imports, unit-testable, the renderer stays dumb. The
 * default window wraps midnight (22:00 → 05:30), which is the case the
 * comparison logic exists for.
 */

export const NIGHT_FROM_DEFAULT = "22:00";
export const NIGHT_TO_DEFAULT = "05:30";

/** "HH:MM" → minutes of the day, or null for anything malformed. */
export function parseHHMM(s: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Is `now` inside the [from, to) window, local time? A window that wraps
 * midnight means "evening OR small hours"; from === to reads as "never" —
 * a zero-length night, not a 24-hour one, because a board that never wakes
 * is a dead display and a board that never sleeps is merely the default.
 * Malformed times fail open to "not night" for the same reason.
 */
export function isNightAt(now: Date, from: string, to: string): boolean {
  const f = parseHHMM(from);
  const t = parseHHMM(to);
  if (f === null || t === null || f === t) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return f < t ? m >= f && m < t : m >= f || m < t;
}
