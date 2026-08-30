import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/sessions";
import { termsCurrent } from "@/lib/terms";
import { BoardLimitError, createBoard, listBoards } from "@/lib/board/boards";
import { CANVAS_PRESET_IDS, WIDGET_TYPES } from "@/lib/board/widgets";
import { isThemeId } from "@/lib/themes";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const CreateInput = z.object({
  name: z.string().trim().min(1, "Give the display a name.").max(80),
  theme: z.string().max(32).refine(isThemeId, "Unknown theme."),
  canvas: z.enum(CANVAS_PRESET_IDS as [string, ...string[]]).optional(),
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
  if (!termsCurrent(user)) return NextResponse.json({ error: "Accept the agreement first." }, { status: 403 });

  const parsed = CreateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  try {
    const id = await createBoard(user.id, {
      name: parsed.data.name,
      theme: parsed.data.theme,
      ...(parsed.data.canvas ? { canvas: parsed.data.canvas as (typeof CANVAS_PRESET_IDS)[number] } : {}),
      widgets: [...new Set(parsed.data.widgets)],
      ...(parsed.data.configs ? { configs: parsed.data.configs } : {}),
    });
    await audit({ actorId: user.id, action: "board.created", targetType: "Board", targetId: id });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof BoardLimitError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid widget settings." }, { status: 400 });
    }
    throw err;
  }
}
