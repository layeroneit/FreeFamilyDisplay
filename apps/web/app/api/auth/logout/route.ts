import { NextResponse } from "next/server";
import { clearSessionCookie, clientIp, getSessionUser, revokeCurrentSession } from "@/lib/auth/sessions";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSessionUser();
  const revoked = await revokeCurrentSession();
  await clearSessionCookie();
  if (user && revoked) {
    await audit({ actorId: user.id, action: "auth.logout", ip: await clientIp() });
  }
  return NextResponse.json({ ok: true });
}
