import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ffd/db";
import { getSessionUser } from "@/lib/auth/sessions";
import { termsCurrent } from "@/lib/terms";
import { isThemeId } from "@/lib/themes";

export const dynamic = "force-dynamic";

const Input = z.object({ theme: z.string().max(32) });

/** Sets the signed-in user's UI theme. Tenancy: only ever writes own row. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!termsCurrent(user)) return NextResponse.json({ error: "Accept the agreement first." }, { status: 403 });

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isThemeId(parsed.data.theme)) {
    return NextResponse.json({ error: "Unknown theme." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { uiTheme: parsed.data.theme },
  });
  return NextResponse.json({ ok: true });
}
