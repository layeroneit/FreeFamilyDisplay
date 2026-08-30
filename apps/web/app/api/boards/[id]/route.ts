import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/sessions";
import { termsCurrent } from "@/lib/terms";
import { deleteBoard, getBoard, updateBoard, type BoardPatch } from "@/lib/board/boards";
import { CANVAS_PRESET_IDS, publicWidgetConfig, type CanvasPreset } from "@/lib/board/widgets";
import { canUseCollection, requestAdvance } from "@/lib/board/wallpapers";
import { pokeWorkerConnectors } from "@/lib/board/worker-poke";
import { isThemeId } from "@/lib/themes";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PatchInput = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    theme: z.string().max(32).refine(isThemeId, "Unknown theme.").optional(),
    canvas: z.enum(CANVAS_PRESET_IDS as [string, ...string[]]).optional(),
    wallpaperCollectionId: z.string().max(64).nullable().optional(),
    wallpaperRotation: z.enum(["EVERY_5_MIN", "EVERY_15_MIN", "EVERY_30_MIN", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "MANUAL"]).optional(),
    /** Weekly THEME rotation - the outer loop, independent of the interval above. */
    cycleCollections: z.boolean().optional(),
    wallpaperOrder: z.enum(["SEQUENTIAL", "SHUFFLE"]).optional(),
    scrimOpacityOverride: z.number().min(0).max(1).nullable().optional(),
    matchPaletteToWallpaper: z.boolean().optional(),
    weatherMood: z.boolean().optional(),
    weatherMoodStrength: z.number().int().min(0).max(100).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update.");

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  const board = await getBoard(user.id, id);
  if (!board) return NextResponse.json({ error: "No such display." }, { status: 404 });
  // Secrets (encrypted links) never leave the server.
  return NextResponse.json({
    board: { ...board, widgets: board.widgets.map((w) => ({ ...w, config: publicWidgetConfig(w.type, w.config) })) },
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!termsCurrent(user)) return NextResponse.json({ error: "Accept the agreement first." }, { status: 403 });
  const { id } = await ctx.params;
  const parsed = PatchInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const d = parsed.data;
  if (d.wallpaperCollectionId && !(await canUseCollection(user.id, d.wallpaperCollectionId))) {
    return NextResponse.json({ error: "That collection isn't available." }, { status: 404 });
  }
  const patch: BoardPatch = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.theme !== undefined) patch.theme = d.theme;
  if (d.canvas !== undefined) patch.canvas = d.canvas as CanvasPreset;
  if (d.wallpaperCollectionId !== undefined) patch.wallpaperCollectionId = d.wallpaperCollectionId;
  if (d.wallpaperRotation !== undefined) patch.wallpaperRotation = d.wallpaperRotation;
  if (d.cycleCollections !== undefined) patch.cycleCollections = d.cycleCollections;
  if (d.wallpaperOrder !== undefined) patch.wallpaperOrder = d.wallpaperOrder;
  if (d.scrimOpacityOverride !== undefined) patch.scrimOpacityOverride = d.scrimOpacityOverride;
  if (d.matchPaletteToWallpaper !== undefined) patch.matchPaletteToWallpaper = d.matchPaletteToWallpaper;
  if (d.weatherMood !== undefined) patch.weatherMood = d.weatherMood;
  if (d.weatherMoodStrength !== undefined) patch.weatherMoodStrength = d.weatherMoodStrength;

  const ok = await updateBoard(user.id, id, patch);
  if (!ok) return NextResponse.json({ error: "No such display." }, { status: 404 });
  // A newly assigned collection gets its first wallpaper right away.
  if (d.wallpaperCollectionId) {
    void requestAdvance(id);
    // A tag-backed theme is empty until the worker fetches it. Without this
    // poke, picking "Anime" shows nothing for up to fifteen minutes and looks
    // broken; with it the images start landing immediately.
    pokeWorkerConnectors();
  }
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
