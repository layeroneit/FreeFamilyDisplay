import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { MEDIA_DIR, mayReadGameDayArt } from "@/lib/board/media-access";
import { isNflTeamId } from "@/lib/board/nfl";

export const dynamic = "force-dynamic";

/** Unlike every other media path this file is NOT worker-normalized — it is
 *  whatever the operator dropped in. A Pi decodes it on every board render,
 *  so an accidental 40 MB scan gets a 404 (and the setup note says: a PNG a
 *  few hundred px tall is plenty for a 170px badge). */
const MAX_ART_BYTES = 4_000_000;

/**
 * Serves the household's own game-day art: `<team>.png` from the media
 * volume's `gameday/` folder, placed there by the operator (see
 * gameday-frame.tsx). The team must be a real NFL abbreviation from our own
 * table — checked before the filesystem is touched, so the path can only
 * ever be one of 32 known names. The file itself never enters the repo or
 * the image; a fresh clone serves 404s here, by design.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ team: string }> }) {
  const { team } = await ctx.params;
  if (!/^[A-Z]{2,3}$/.test(team) || !isNflTeamId(team)) return new NextResponse(null, { status: 404 });

  if (!(await mayReadGameDayArt(team))) return new NextResponse(null, { status: 404 });

  const abs = path.join(MEDIA_DIR, "gameday", `${team}.png`);
  try {
    const s = await stat(abs);
    if (s.size > MAX_ART_BYTES) return new NextResponse(null, { status: 404 });
    return new NextResponse(Readable.toWeb(createReadStream(abs)) as ReadableStream, {
      // 10 minutes: a replaced logo shows within one refresh cycle or two.
      headers: { "content-type": "image/png", "content-length": String(s.size), "cache-control": "private, max-age=600" },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
