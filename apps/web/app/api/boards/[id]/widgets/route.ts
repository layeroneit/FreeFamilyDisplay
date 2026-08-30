import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/sessions";
import { addWidget } from "@/lib/board/boards";
import { WIDGET_TYPES } from "@/lib/board/widgets";

export const dynamic = "force-dynamic";

const AddInput = z.object({ type: z.enum(WIDGET_TYPES), config: z.unknown().optional() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = AddInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown widget." }, { status: 400 });
  try {
    const widget = await addWidget(user.id, id, parsed.data.type, parsed.data.config);
    if (!widget) return NextResponse.json({ error: "No such display." }, { status: 404 });
    return NextResponse.json({ widget }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid widget settings." }, { status: 400 });
    }
    throw err;
  }
}
