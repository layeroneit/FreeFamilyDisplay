import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/sessions";
import { createBoard, listBoards } from "@/lib/board/boards";
import { WIDGET_TYPES } from "@/lib/board/widgets";
import { isThemeId } from "@/lib/themes";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const CreateInput = z.object({
  name: z.string().trim().min(1, "Give the display a name.").max(80),
  theme: z.string().max(32).refine(isThemeId, "Unknown theme."),
  widgets: z.array(z.enum(WIDGET_TYPES)).min(1, "Pick at least one widget."),
  configs: z.record(z.enum(WIDGET_TYPES), z.unknown()).optional(),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ boards: await listBoards(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = CreateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  try {
    const id = await createBoard(user.id, {
      name: parsed.data.name,
      theme: parsed.data.theme,
      widgets: [...new Set(parsed.data.widgets)],
      ...(parsed.data.configs ? { configs: parsed.data.configs } : {}),
    });
    await audit({ actorId: user.id, action: "board.created", targetType: "Board", targetId: id });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid widget settings." }, { status: 400 });
    }
    throw err;
  }
}
