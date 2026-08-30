/**
 * Password hashing (ADR 0003 — operator accounts only).
 *
 * bcryptjs, cost 12. A fixed dummy hash is verified when the account doesn't
 * exist or has no password, so the request costs the same either way — the
 * response-identity rule (§8.1) has to hold for timing too, or it holds for
 * nothing.
 */

import bcrypt from "bcryptjs";

export const BCRYPT_COST = 12;

/** Hash of a random unguessable string, generated once at module load. */
const dummyHashPromise: Promise<string> = bcrypt.hash(
  `ffd-dummy-${Date.now()}-${Math.random()}`,
  BCRYPT_COST,
);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Verifies a candidate against a stored hash — or against the dummy when the
 * stored hash is null/absent, always returning false in that case but taking
 * the same time as a real comparison.
 */
export async function verifyPassword(
  candidate: string,
  storedHash: string | null,
): Promise<boolean> {
  if (storedHash === null) {
    await bcrypt.compare(candidate, await dummyHashPromise);
    return false;
  }
  return bcrypt.compare(candidate, storedHash);
}

/**
 * Minimal operator password policy: length only. Composition rules are
 * user-hostile theater; 12+ characters against a bcrypt-cost-12 hash with
 * rate limiting is the honest control.
 *
 * Exported as constants because the first-run form (ADR 0004) has to tell a
 * stranger the number before they type, and a UI that says "8" while the
 * server wants 12 is a bug report waiting to happen.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function passwordMeetsPolicy(plain: string): boolean {
  return plain.length >= PASSWORD_MIN_LENGTH && plain.length <= PASSWORD_MAX_LENGTH;
}
