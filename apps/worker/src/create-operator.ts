/**
 * Operator bootstrap (ADR 0003). Creates or updates the OPERATOR account —
 * the only way the first login can exist, since signup is invite-only and
 * invites require an operator.
 *
 * Runs inside the worker container so it has the DB client and bcrypt without
 * shipping a CLI toolchain:
 *
 *   docker compose -f infra/compose.yaml --env-file .env exec \
 *     -e OP_EMAIL=you@example.com -e OP_NAME="Your Name" -e OP_PASSWORD='...' \
 *     worker node apps/worker/dist/create-operator.js
 *
 * Env vars, not argv: argv is visible in `ps` output for the process lifetime.
 * The password is written nowhere — not argv, not logs, not stdout.
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

const user = await prisma.user.upsert({
  where: { email },
  create: { email, displayName, role: "OPERATOR", passwordHash },
  update: { role: "OPERATOR", passwordHash, disabledAt: null },
  select: { id: true },
});

await prisma.auditLog.create({
  data: { actorId: user.id, action: "operator.bootstrap", targetType: "User", targetId: user.id },
});

log.info("operator account ready", { userId: user.id });
await prisma.$disconnect();
