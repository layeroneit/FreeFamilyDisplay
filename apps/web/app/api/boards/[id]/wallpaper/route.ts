import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/sessions";
import { getBoard } from "@/lib/board/boards";
import { requestAdvance, skipCurrent, togglePin } from "@/lib/board/wallpapers";

export const dynamic = "force-dynamic";

const Input = z.object({ action: z.enum(["next", "pin", "skip"]) });

/** Per-image actions on the board's current wallpaper (spec §3). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const board = await getBoard(user.id, id);
  if (!board) return NextResponse.json({ error: "No such display." }, { status: 404 });
  if (!board.wallpaperCollectionId) return NextResponse.json({ error: "This display has no wallpaper collection." }, { status: 400 });

  switch (parsed.data.action) {
    case "pin":
      await togglePin(user.id, board);
      return NextResponse.json({ ok: true });
    case "skip":
      await skipCurrent(user.id, board);
      await requestAdvance(board.id);
      return NextResponse.json({ ok: true });
    case "next": {
      const ok = await requestAdvance(board.id);
      return NextResponse.json(ok ? { ok: true } : { error: "The worker didn't answer — it will rotate on schedule." }, { status: ok ? 200 : 503 });
    }
  }
}
