import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ffd/db";
import { clientIp, getSessionUser } from "@/lib/auth/sessions";
import { TERMS_VERSION } from "@/lib/terms";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const Input = z.object({ version: z.literal(TERMS_VERSION) });

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That agreement version is out of date — reload the page." }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { termsAcceptedAt: new Date(), termsAcceptedVersion: TERMS_VERSION },
  });
  await audit({ actorId: user.id, action: "terms.accepted", targetType: "Terms", targetId: TERMS_VERSION, ip: await clientIp() });
  return NextResponse.json({ ok: true });
}
