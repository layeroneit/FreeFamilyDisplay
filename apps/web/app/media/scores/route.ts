import { NextResponse } from "next/server";
import { prisma } from "@ffd/db";
import { getSessionUser } from "@/lib/auth/sessions";
import { displayBoardId } from "@/lib/board/media-access";
import { NFL_CACHE_KEY, NFL_CACHE_KIND, readNflRow } from "@/lib/board/nfl";

export const dynamic = "force-dynamic";

/**
 * Live scores for the scores widget's client-side poll. The widget is
 * server-rendered, but the kiosk only re-renders every five minutes — during
 * a game that read as "taking too long" on the wall, so the widget now polls
 * this route and the wall shows a score within ~a minute of ESPN having it
 * (worker fetch ≤30s + poll ≤30s).
 *
 * Lives under /media because that is the path the display-token cookie is
 * scoped to (middleware.ts) — the same arrangement every kiosk-fetched
 * resource uses. Reads Postgres only (plan §4.2: the render path never
 * fetches third parties); auth is a session or a display token, the same
 * two readers the media routes accept. The payload is public sports scores,
 * but an unauthenticated internet caller still gets a 404, not data.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user && !(await displayBoardId())) return new NextResponse(null, { status: 404 });

  const row = await prisma.cachedPayload.findUnique({
    where: { kind_key: { kind: NFL_CACHE_KIND, key: NFL_CACHE_KEY } },
    select: { payload: true, fetchedAt: true, lastError: true },
  });
  // The widget polls every 30s; never let an intermediary cache a score.
  const headers = { "cache-control": "no-store" };
  if (!row) return NextResponse.json({ games: [], syncedAtMs: null, error: null }, { headers });

  // Shared interpretation with the page render (see readNflRow) — the two
  // halves of the widget's state must never disagree about the same row.
  const { games, syncedAtMs, error } = readNflRow(row);
  return NextResponse.json({ games, syncedAtMs, error }, { headers });
}
