import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/sessions";
import { deleteBoard, getBoard, updateBoard } from "@/lib/board/boards";
import { isThemeId } from "@/lib/themes";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PatchInput = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    theme: z.string().max(32).refine(isThemeId, "Unknown theme.").optional(),
  })
  .refine((v) => v.name !== undefined || v.theme !== undefined, "Nothing to update.");

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  const board = await getBoard(user.id, id);
  if (!board) return NextResponse.json({ error: "No such display." }, { status: 404 });
  return NextResponse.json({ board });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = PatchInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const patch: { name?: string; theme?: string } = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.theme !== undefined) patch.theme = parsed.data.theme;
  const ok = await updateBoard(user.id, id, patch);
  if (!ok) return NextResponse.json({ error: "No such display." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  const ok = await deleteBoard(user.id, id);
  if (!ok) return NextResponse.json({ error: "No such display." }, { status: 404 });
  await audit({ actorId: user.id, action: "board.deleted", targetType: "Board", targetId: id });
  return NextResponse.json({ ok: true });
}
