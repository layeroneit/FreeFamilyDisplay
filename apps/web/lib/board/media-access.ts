import "server-only";
import { cookies } from "next/headers";

/** One definition: the route that serves media and the scene loader that
 *  advertises it must never disagree about where the volume lives. */
export const MEDIA_DIR = process.env.MEDIA_DIR ?? "/app/media";
import { prisma } from "@ffd/db";
import { getSessionUser } from "@/lib/auth/sessions";
import { hashDisplayToken } from "./display-links";
import { displayTokensFrom } from "./display-cookie";

/**
 * Media files have two legitimate readers: the signed-in owner, and a wall
 * screen holding a display token for a board that actually uses the file.
 *
 * The display path is deliberately narrower than the session path. A session
 * grants everything the user owns; a display token grants only what its own
 * board renders, so a token for the kitchen screen cannot pull photos from a
 * widget on a different board — even though both belong to the same account.
 */

/** Boards whose display tokens this browser holds (one cookie per board). */
export async function displayBoardIds(): Promise<string[]> {
  const tokens = displayTokensFrom((await cookies()).getAll());
  if (tokens.length === 0) return [];
  const boards = await prisma.board.findMany({ where: { displayTokenHash: { in: tokens.map(hashDisplayToken) } }, select: { id: true } });
  return boards.map((b) => b.id);
}

/** May the caller read the cached photos of this widget? */
export async function mayReadWidgetMedia(widgetId: string): Promise<boolean> {
  const user = await getSessionUser();
  if (user) {
    const owned = await prisma.boardWidget.findFirst({ where: { id: widgetId, board: { userId: user.id } }, select: { id: true } });
    if (owned) return true;
  }
  const boardIds = await displayBoardIds();
  if (boardIds.length === 0) return false;
  const onBoard = await prisma.boardWidget.findFirst({ where: { id: widgetId, boardId: { in: boardIds } }, select: { id: true } });
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
  const boardIds = await displayBoardIds();
  if (boardIds.length === 0) return false;
  const boards = await prisma.board.findMany({ where: { id: { in: boardIds } }, select: { style: true } });
  return boards.some((b) => (b.style as { nflTeam?: unknown } | null)?.nflTeam === team);
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
  const boardIds = await displayBoardIds();
  if (boardIds.length === 0) return false;
  // Only the collection the board is actually showing.
  const board = await prisma.board.findFirst({ where: { id: { in: boardIds }, wallpaperCollectionId: collectionId }, select: { id: true } });
  return board !== null;
}
