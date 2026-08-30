import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { mayReadWidgetMedia } from "@/lib/board/media-access";

export const dynamic = "force-dynamic";

const MEDIA_DIR = process.env.MEDIA_DIR ?? "/app/media";

/**
 * Serves a cached photo from the shared media volume. Readable by the owner,
 * or by a wall screen whose display token is for the board this widget sits
 * on (plan §8.2). File names are content
 * hashes written by the worker — anything else is rejected before touching
 * the filesystem.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ widgetId: string; file: string }> }) {
  const { widgetId, file } = await ctx.params;
  if (!/^[a-f0-9]{24}\.jpg$/.test(file) || !/^[a-z0-9]+$/i.test(widgetId)) return new NextResponse(null, { status: 404 });

  if (!(await mayReadWidgetMedia(widgetId))) return new NextResponse(null, { status: 404 });

  const abs = path.join(MEDIA_DIR, "photos", widgetId, file);
  try {
    const s = await stat(abs);
    const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream;
    return new NextResponse(stream, {
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(s.size),
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
