import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/sessions";
import { termsCurrent } from "@/lib/terms";
import { rotateDisplayToken, revokeDisplayToken } from "@/lib/board/display-links";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Mints (or replaces) this board's display link and returns the full URL
 * ONCE. Only the hash is kept, so this response is the only chance to copy
 * it; asking again issues a new link and breaks screens on the old one.
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!termsCurrent(user)) return NextResponse.json({ error: "Accept the agreement first." }, { status: 403 });
  const { id } = await ctx.params;

  const token = await rotateDisplayToken(user.id, id);
  if (!token) return NextResponse.json({ error: "No such display." }, { status: 404 });
  await audit({ actorId: user.id, action: "board.display_link.rotated", targetType: "Board", targetId: id });

  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return NextResponse.json({ url: `${base}/d/${token}`, path: `/d/${token}` });
}

/** Revokes the link. Every screen using it goes to "not found" on next load. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  const ok = await revokeDisplayToken(user.id, id);
  if (!ok) return NextResponse.json({ error: "No such display." }, { status: 404 });
  await audit({ actorId: user.id, action: "board.display_link.revoked", targetType: "Board", targetId: id });
  return NextResponse.json({ ok: true });
}
