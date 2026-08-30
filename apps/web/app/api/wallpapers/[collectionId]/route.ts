import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@ffd/db";
import { getSessionUser } from "@/lib/auth/sessions";
import { audit } from "@/lib/audit";
import { rm } from "node:fs/promises";
import path from "node:path";
import { termsCurrent } from "@/lib/terms";

const MEDIA_DIR = process.env.MEDIA_DIR ?? "/app/media";

export const dynamic = "force-dynamic";

/** Deletes one of the user's OWN collections (built-ins can't be deleted). Boards using it fall back to no wallpaper (FK SetNull). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ collectionId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!termsCurrent(user)) return NextResponse.json({ error: "Accept the agreement first." }, { status: 403 });
  const { collectionId } = await ctx.params;
  const r = await prisma.wallpaperCollection.deleteMany({ where: { id: collectionId, ownerId: user.id, isBuiltin: false } });
  if (r.count === 0) return NextResponse.json({ error: "No such collection." }, { status: 404 });
  await audit({ actorId: user.id, action: "wallpapers.collection.deleted", targetType: "WallpaperCollection", targetId: collectionId });
  // Cached renditions go with the row. The id is a cuid (validated by the
  // deleteMany match above), so the path cannot escape the wallpapers dir.
  await rm(path.join(MEDIA_DIR, "wallpapers", collectionId), { recursive: true, force: true }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
