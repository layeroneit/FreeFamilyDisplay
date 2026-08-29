import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ffd/db";
import { verifyPassword } from "@/lib/auth/password";
import { loginAccountLimiter, loginIpLimiter } from "@/lib/auth/rate-limit";
import { clientIp, createSession, setSessionCookie } from "@/lib/auth/sessions";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(128),
});

/**
 * The one generic failure body. Wrong password, unknown account, disabled
 * account, and passwordless (MEMBER) account are deliberately identical —
 * §8.1 forbids leaking account existence. The verifyPassword dummy-compare
 * keeps the timing profile flat across those branches too.
 */
const FAILED = { error: "That email and password combination didn't work." };

export async function POST(req: NextRequest) {
  const ip = await clientIp();

  const ipCheck = loginIpLimiter.hit(`ip:${ip}`);
  if (ipCheck.limited) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes and try again." },
      { status: 429, headers: { "retry-after": String(Math.ceil(ipCheck.retryAfterMs / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(FAILED, { status: 401 });
  }
  const parsed = LoginInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(FAILED, { status: 401 });
  }
  const { email, password } = parsed.data;

  const acctCheck = loginAccountLimiter.hit(`acct:${email}`);
  if (acctCheck.limited) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes and try again." },
      { status: 429, headers: { "retry-after": String(Math.ceil(acctCheck.retryAfterMs / 1000)) } },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, disabledAt: true },
  });

  // Always verify — against the dummy hash when there's nothing real to check.
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? null);
  const ok = passwordOk && user !== null && user.disabledAt === null;

  if (!ok) {
    // Audit only when the account exists; unknown addresses are not recorded.
    if (user) {
      await audit({ actorId: user.id, action: "auth.login.password.failed", ip });
    }
    return NextResponse.json(FAILED, { status: 401 });
  }

  const token = await createSession(user.id, req.headers.get("user-agent"));
  await setSessionCookie(token);
  await audit({ actorId: user.id, action: "auth.login.password.ok", ip });

  return NextResponse.json({ ok: true });
}
