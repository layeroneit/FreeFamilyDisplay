/**
 * First-run bootstrap (ADR 0004). This software is freeware that each family
 * stands up on their own machine, so the very first account cannot come from
 * an invite — there is nobody to send one — and cannot require a terminal
 * step. While the database holds zero users the instance is UNCLAIMED, and a
 * one-time web form creates the operator account that claims it.
 *
 * The gate is "zero users", not "zero operators": once anybody exists, the
 * instance belongs to a household and the bootstrap door is closed for good.
 * The only way to reopen it is to delete every user row, which is a deliberate
 * act on the box, not something a visitor can cause.
 *
 * Hashing and the length policy are the ADR 0003 ones from ./password — this
 * is a second entrance to the same account, not a second kind of account.
 */

import "server-only";
import { prisma } from "@ffd/db";
import { hashPassword, passwordMeetsPolicy } from "./password";

/**
 * Advisory-lock key for the claim transaction. Arbitrary but fixed; it only
 * has to be a pair nothing else in this database uses. Advisory locks share
 * one global namespace, so the constants are written out literally here rather
 * than derived, to make a future collision greppable.
 *
 * The two-argument `(int4, int4)` form is deliberate over the one-argument
 * `(int8)` one: both halves fit int32 with room to spare, so the parameters
 * cannot be mis-inferred as the wrong width, and the explicit `::int` casts
 * pin it down even if the driver hands them over as untyped text.
 */
export const CLAIM_LOCK_NAMESPACE = 0x46464400; // "FFD\0" — 1179010048, inside int32
export const CLAIM_LOCK_ID = 4; // ADR 0004

/**
 * Three answers, not two. "unknown" means the database could not be asked,
 * which is NOT the same as "claimed" -- even though both must deny the wizard.
 *
 * Page gates want a boolean and treat unknown as claimed (see
 * `instanceClaimed`). The claim route wants the distinction, so a household
 * whose Postgres has not finished starting is told "cannot reach the database"
 * rather than the flatly false "this display already has an account, sign in
 * instead" -- advice that sends them hunting for an account nobody ever made.
 */
export type ClaimState = "claimed" | "unclaimed" | "unknown";

export async function instanceClaimState(): Promise<ClaimState> {
  try {
    // `findFirst` over `count`: we need "any at all", and this stops at the
    // first row instead of walking the table.
    return (await prisma.user.findFirst({ select: { id: true } })) !== null
      ? "claimed"
      : "unclaimed";
  } catch {
    return "unknown";
  }
}

/**
 * True when at least one account exists -- i.e. the bootstrap route must
 * behave as if it does not exist.
 *
 * Fails CLOSED: an unreachable database reports `true`, because the
 * alternative is that a Postgres blip briefly reopens account creation to
 * anyone who can reach the box. A false "claimed" costs a stranger a confusing
 * 404 on an instance that is already broken; a false "unclaimed" costs them
 * the instance itself.
 */
export async function instanceClaimed(): Promise<boolean> {
  return (await instanceClaimState()) !== "unclaimed";
}

export type ClaimInput = {
  email: string;
  displayName: string;
  password: string;
  /** Coarse client address, recorded on the audit row. Never authorization. */
  ip?: string;
};

export type ClaimResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "already-claimed" | "weak-password" };

/**
 * Creates the first account and claims the instance, or refuses.
 *
 * The race this has to survive: two people (or one person and one impatient
 * double-click) submit the form at the same moment. A plain `if (count === 0)`
 * does not survive it — Prisma runs at READ COMMITTED, where both transactions
 * legitimately see zero users and both go on to insert. The unique index on
 * email only catches the case where they picked the SAME address; two
 * different addresses would produce two operators, and the second one is an
 * account the household never asked for.
 *
 * So the emptiness check is taken under a transaction-scoped Postgres advisory
 * lock. The second transaction blocks on the lock until the first commits,
 * then re-reads and sees the account that now exists. The lock is released by
 * the transaction ending — commit, rollback, or a dropped connection — so a
 * crashed request cannot wedge the door shut.
 */
export async function claimInstance(input: ClaimInput): Promise<ClaimResult> {
  if (!passwordMeetsPolicy(input.password)) return { ok: false, reason: "weak-password" };

  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();

  // Hash outside the transaction: bcrypt at cost 12 takes a few hundred
  // milliseconds, and holding a global advisory lock across it would let a
  // burst of submissions queue up on the database rather than on the CPU.
  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLAIM_LOCK_NAMESPACE}::int, ${CLAIM_LOCK_ID}::int)`;

    const existing = await tx.user.findFirst({ select: { id: true } });
    if (existing) return { ok: false, reason: "already-claimed" as const };

    const created = await tx.user.create({
      data: { email, displayName, role: "OPERATOR", passwordHash },
      select: { id: true },
    });
    // Written INSIDE the transaction, unlike the best-effort `audit()` helper:
    // this row is the permanent record of who took ownership of the instance,
    // and an account that exists with no claim row beside it is a worse
    // outcome than a failed claim the operator simply retries.
    await tx.auditLog.create({
      data: {
        actorId: created.id,
        action: "instance.claimed",
        targetType: "User",
        targetId: created.id,
        ip: input.ip ?? null,
      },
    });
    return { ok: true as const, userId: created.id };
  });
}
