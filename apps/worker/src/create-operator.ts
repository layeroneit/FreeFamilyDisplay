/**
 * Operator account recovery (ADR 0003). Creates an OPERATOR account or rotates
 * its password.
 *
 * This used to be the ONLY way the first login could exist — signup was
 * invite-only and invites required an operator, so the chain had no root. ADR
 * 0004 replaced that with a first-run web form at `/welcome`, live only while
 * the database holds zero users, because a household standing up its own copy
 * of this software is not going to run a docker exec command.
 *
 * So this is no longer the bootstrap path. What it is now is the answer to a
 * FORGOTTEN PASSWORD, which ADR 0003 deliberately left with no email-based
 * reset — and the escape hatch if the first-run form is ever unreachable.
 * The hashing (bcrypt cost 12) and length policy (12-128) match
 * `apps/web/lib/auth/password.ts` on purpose: two entrances, one account.
 *
 * Runs inside the worker container:
 *
 *   docker compose -f infra/compose.yaml --env-file .env exec \
 *     -e OP_EMAIL=you@example.com -e OP_NAME="Your Name" -e OP_PASSWORD='...' \
 *     worker node apps/worker/dist/create-operator.js
 *
 * Env vars, not argv: argv is visible in `ps` for the process lifetime. The
 * password is written nowhere — not argv, not logs, not stdout.
 *
 * Deliberate guardrails (Phase 1a audit):
 * - Rotating a password revokes every live session for the account. A rotation
 *   after a suspected leak that leaves old sessions alive is theater.
 * - A disabled account is NOT silently re-enabled; requires OP_REENABLE=yes.
 * - An existing MEMBER is NOT silently promoted; requires OP_PROMOTE=yes.
 */

import bcrypt from "bcryptjs";
import { prisma } from "@ffd/db";
import { createLogger } from "@ffd/log";

const log = createLogger("create-operator");

const email = process.env.OP_EMAIL?.trim().toLowerCase();
const displayName = process.env.OP_NAME?.trim() || "Operator";
const password = process.env.OP_PASSWORD;

if (!email || !email.includes("@") || email.length > 320) {
  log.error("OP_EMAIL missing or invalid");
  process.exit(1);
}
if (!password || password.length < 12 || password.length > 128) {
  log.error("OP_PASSWORD must be 12-128 characters");
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 12);

const existing = await prisma.user.findUnique({
  where: { email },
  select: { id: true, role: true, disabledAt: true },
});

if (existing?.disabledAt && process.env.OP_REENABLE !== "yes") {
  log.error("account is disabled; re-run with OP_REENABLE=yes to re-enable it");
  process.exit(1);
}
if (existing && existing.role !== "OPERATOR" && process.env.OP_PROMOTE !== "yes") {
  log.error("account exists as MEMBER; re-run with OP_PROMOTE=yes to promote it");
  process.exit(1);
}

const result = await prisma.$transaction(async (tx) => {
  if (!existing) {
    const created = await tx.user.create({
      data: { email, displayName, role: "OPERATOR", passwordHash },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: { actorId: created.id, action: "operator.bootstrap.created", targetType: "User", targetId: created.id },
    });
    return { id: created.id, branch: "created", revoked: 0 };
  }

  await tx.user.update({
    where: { id: existing.id },
    data: {
      displayName,
      role: "OPERATOR",
      passwordHash,
      ...(existing.disabledAt && process.env.OP_REENABLE === "yes" ? { disabledAt: null } : {}),
    },
  });
  // Password rotation invalidates every live session for this account.
  const revoked = await tx.session.updateMany({
    where: { userId: existing.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await tx.auditLog.create({
    data: {
      actorId: existing.id,
      action: existing.disabledAt ? "operator.bootstrap.reenabled" : "operator.bootstrap.rotated",
      targetType: "User",
      targetId: existing.id,
    },
  });
  return { id: existing.id, branch: "updated", revoked: revoked.count };
});

log.info("operator account ready", {
  userId: result.id,
  branch: result.branch,
  sessionsRevoked: result.revoked,
});
await prisma.$disconnect();
