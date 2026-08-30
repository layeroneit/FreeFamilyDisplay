import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@ffd/db";
import { getBoard, type BoardFull } from "./boards";

/**
 * Display links (plan §8.2). A wall screen must not hold a session: it is a
 * device in a hallway that nobody logs out of, and a session would carry the
 * full admin UI with it. Instead each board can mint one opaque token; the
 * screen opens /d/<token> and gets that board, read-only, and nothing else.
 *
 * Only the SHA-256 of the token is stored, exactly as Session does, so a
 * database dump does not hand out working display URLs. The plaintext is
 * returned once at creation and never again — rotating is how you replace it,
 * and rotating instantly kills every screen on the old link.
 */

/** 32 bytes, base64url — 256 bits of entropy, no lookalike characters to mistype. */
function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDisplayToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates or replaces a board's display token. Returns the plaintext ONCE. */
export async function rotateDisplayToken(userId: string, boardId: string): Promise<string | null> {
  const token = mintToken();
  const r = await prisma.board.updateMany({
    where: { id: boardId, userId },
    data: { displayTokenHash: hashDisplayToken(token), displayTokenAt: new Date(), displaySeenAt: null },
  });
  return r.count === 1 ? token : null;
}

/** Removes a board's display link; every screen using it stops working. */
export async function revokeDisplayToken(userId: string, boardId: string): Promise<boolean> {
  const r = await prisma.board.updateMany({
    where: { id: boardId, userId },
    data: { displayTokenHash: null, displayTokenAt: null, displaySeenAt: null },
  });
  return r.count === 1;
}

/** How often the display route refreshes `displaySeenAt`. */
const SEEN_INTERVAL_MS = 60_000;

/**
 * Resolves a display token to its board. No user, no session — the token IS
 * the authorisation, and it grants exactly one board in read-only form.
 * Returns null for anything unknown, so a wrong token is indistinguishable
 * from a deleted board.
 */
export async function boardForDisplayToken(token: string): Promise<BoardFull | null> {
  // Cheap shape check before touching the database.
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = await prisma.board.findUnique({
    where: { displayTokenHash: hashDisplayToken(token) },
    select: { id: true, userId: true, displaySeenAt: true },
  });
  if (!row) return null;

  // Liveness ping, rate-limited so a 5-minute-refresh wall screen doesn't
  // write on every paint and a hostile caller can't turn this into a write
  // amplifier.
  const now = Date.now();
  if (!row.displaySeenAt || now - row.displaySeenAt.getTime() > SEEN_INTERVAL_MS) {
    void prisma.board.update({ where: { id: row.id }, data: { displaySeenAt: new Date() } }).catch(() => undefined);
  }
  return getBoard(row.userId, row.id);
}
