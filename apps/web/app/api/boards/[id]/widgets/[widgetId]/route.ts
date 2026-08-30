import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/sessions";
import { removeWidget, updateWidget } from "@/lib/board/boards";
import { GeometrySchema } from "@/lib/board/widgets";
import { BadLinkError } from "@/lib/board/secrets";

export const dynamic = "force-dynamic";

const PatchInput = z
  .object({ geometry: GeometrySchema.optional(), config: z.unknown().optional() })
  .refine((v) => v.geometry !== undefined || v.config !== undefined, "Nothing to update.");

type Ctx = { params: Promise<{ id: string; widgetId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id, widgetId } = await ctx.params;
  const parsed = PatchInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  try {
    const patch: { geometry?: z.infer<typeof GeometrySchema>; config?: unknown } = {};
    if (parsed.data.geometry) patch.geometry = parsed.data.geometry;
    if (parsed.data.config !== undefined) patch.config = parsed.data.config;
    const ok = await updateWidget(user.id, id, widgetId, patch);
    if (!ok) return NextResponse.json({ error: "No such widget." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof BadLinkError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid widget settings." }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id, widgetId } = await ctx.params;
  const ok = await removeWidget(user.id, id, widgetId);
  if (!ok) return NextResponse.json({ error: "No such widget." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
