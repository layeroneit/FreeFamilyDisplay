import "server-only";
import { cookies } from "next/headers";

/** One definition: the route that serves media and the scene loader that
 *  advertises it must never disagree about where the volume lives. */
export const MEDIA_DIR = process.env.MEDIA_DIR ?? "/app/media";
import { prisma } from "@ffd/db";
import { getSessionUser } from "@/lib/auth/sessions";
import { hashDisplayToken } from "./display-links";
import { DISPLAY_COOKIE } from "@/middleware";

/**
 * Media files have two legitimate readers: the signed-in owner, and a wall
 * screen holding a display token for a board that actually uses the file.
 *
 * The display path is deliberately narrower than the session path. A session
 * grants everything the user owns; a display token grants only what its own
 * board renders, so a token for the kitchen screen cannot pull photos from a
 * widget on a different board — even though both belong to the same account.
 */

async function displayBoardId(): Promise<string | null> {
  const token = (await cookies()).get(DISPLAY_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const b = await prisma.board.findUnique({ where: { displayTokenHash: hashDisplayToken(token) }, select: { id: true } });
  return b?.id ?? null;
}

/** May the caller read the cached photos of this widget? */
export async function mayReadWidgetMedia(widgetId: string): Promise<boolean> {
  const user = await getSessionUser();
  if (user) {
    const owned = await prisma.boardWidget.findFirst({ where: { id: widgetId, board: { userId: user.id } }, select: { id: true } });
    if (owned) return true;
  }
  const boardId = await displayBoardId();
  if (!boardId) return false;
  const onBoard = await prisma.boardWidget.findFirst({ where: { id: widgetId, boardId }, select: { id: true } });
  return onBoard !== null;
}

/**
 * May the caller read the household's game-day art for this team? The file
 * is operator-placed (docker compose cp into the media volume — it is never
 * part of the repo or image, which is the trademark line: personal use on
 * the household's own wall, no redistribution). Any signed-in member may see
 * it; a wall screen only when its own board has that team picked.
 */
export async function mayReadGameDayArt(team: string): Promise<boolean> {
  const user = await getSessionUser();
  if (user) return true;
  const boardId = await displayBoardId();
  if (!boardId) return false;
  const b = await prisma.board.findUnique({ where: { id: boardId }, select: { style: true } });
  return (b?.style as { nflTeam?: unknown } | null)?.nflTeam === team;
}

/** May the caller read the renditions of this wallpaper collection? */
export async function mayReadCollectionMedia(collectionId: string): Promise<boolean> {
  const user = await getSessionUser();
  if (user) {
    const usable = await prisma.wallpaperCollection.findFirst({
      where: { id: collectionId, OR: [{ isBuiltin: true }, { ownerId: user.id }] },
      select: { id: true },
    });
    if (usable) return true;
  }
  const boardId = await displayBoardId();
  if (!boardId) return false;
  // Only the collection the board is actually showing.
  const board = await prisma.board.findFirst({ where: { id: boardId, wallpaperCollectionId: collectionId }, select: { id: true } });
  return board !== null;
}
