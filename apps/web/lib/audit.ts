import "server-only";
import { prisma } from "@ffd/db";
import { createLogger } from "@ffd/log";

const log = createLogger("web.audit");

/**
 * Append-only audit trail (plan §5). Best-effort by design: an audit insert
 * failure is logged but never fails the user-facing action — otherwise a full
 * disk turns into a lockout.
 *
 * Never pass secrets or attempted email addresses of unknown accounts.
 */
export async function audit(entry: {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        ip: entry.ip ?? null,
      },
    });
  } catch (err) {
    log.error("audit write failed", {
      action: entry.action,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
