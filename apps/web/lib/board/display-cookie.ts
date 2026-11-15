/**
 * Display-token cookies for wall screens (see middleware.ts). Kept free of
 * server-only imports so the middleware can use it.
 *
 * One cookie per board token, not one shared cookie: with a single
 * `ffd_display`, a second board tab on the same kiosk browser, or a visit to
 * a stale or revoked link, overwrote the good token and the first board's
 * photos and wallpapers started returning 404. The cookie name carries a short
 * hash of the token, never the token itself.
 */

export const DISPLAY_COOKIE = "ffd_display";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const NAME = /^ffd_display(_[0-9a-f]{12})?$/;
/** A kiosk shows a handful of boards; anything beyond this is noise. */
const MAX_TOKENS = 16;

export async function displayCookieName(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${DISPLAY_COOKIE}_${hex.slice(0, 12)}`;
}

/** Well-formed display tokens from the request's cookies, legacy name included. */
export function displayTokensFrom(cookies: Array<{ name: string; value: string }>): string[] {
  const out = new Set<string>();
  for (const c of cookies) {
    if (out.size >= MAX_TOKENS) break;
    if (NAME.test(c.name) && TOKEN.test(c.value)) out.add(c.value);
  }
  return [...out];
}
