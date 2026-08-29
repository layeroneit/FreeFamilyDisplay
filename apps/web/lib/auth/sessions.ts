/**
 * Session persistence — the DB-bound half of auth. Pure logic lives in
 * session-token.ts where it is unit-tested; this module is the thin seam
 * against Prisma and the cookie store.
 */

import "server-only";
import { cookies, headers } from "next/headers";
import { prisma } from "@ffd/db";
import type { User } from "@ffd/db";
import {
  evaluateSession,
  generateSessionToken,
  hashToken,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "./session-token";

export type SessionUser = Pick<
  User,
  "id" | "email" | "displayName" | "role" | "uiTheme" | "disabledAt"
>;

const sessionUserSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  uiTheme: true,
  disabledAt: true,
} as const;

export async function createSession(userId: string, userAgent: string | null): Promise<string> {
  const token = generateSessionToken();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: userAgent?.slice(0, 255) ?? null,
    },
  });
  return token;
}

/**
 * `Secure` must follow the DEPLOYMENT's scheme, not NODE_ENV: the default
 * stack serves plain HTTP on the LAN (TLS arrives with the tunnel in Phase 6),
 * and Next's standalone server hard-forces NODE_ENV=production. A Secure
 * cookie over http:// is silently discarded by the browser — login "succeeds"
 * and then loops forever with no error shown.
 */
function cookieSecure(): boolean {
  return (process.env.APP_URL ?? "").startsWith("https://");
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/**
 * Resolves the current session to a user, or null. Slides the rolling window
 * at most once an hour. Disabled accounts resolve to null even with a live
 * session — disablement takes effect on next request, not next login.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      lastSeenAt: true,
      revokedAt: true,
      user: { select: sessionUserSelect },
    },
  });
  if (!session || session.revokedAt) return null;
  if (session.user.disabledAt) return null;

  const freshness = evaluateSession(session.expiresAt, session.lastSeenAt);
  if (freshness.state === "expired") return null;

  if (freshness.shouldSlide) {
    // Best-effort: a failed slide must not fail the request.
    await prisma.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: freshness.newExpiry },
      })
      .catch(() => undefined);
  }

  return session.user;
}

/** Revokes the current cookie's session server-side (logout). */
export async function revokeCurrentSession(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const updated = await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return updated.count > 0 ? token : null;
}

/** Coarse client IP for rate limiting and audit — never for authorization. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
