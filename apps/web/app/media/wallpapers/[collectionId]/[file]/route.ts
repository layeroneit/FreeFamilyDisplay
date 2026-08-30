import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { mayReadCollectionMedia } from "@/lib/board/media-access";

export const dynamic = "force-dynamic";

const MEDIA_DIR = process.env.MEDIA_DIR ?? "/app/media";

/**
 * Serves a custom-collection wallpaper from the media volume. Readable by the
 * owner, or by a wall screen whose display token is for a board showing this
 * very collection (plan §8.2). File names are
 * <24-hex>-<1920|2560>.webp written by the worker; anything else is rejected
 * before the filesystem is touched.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ collectionId: string; file: string }> }) {
  const { collectionId, file } = await ctx.params;
  if (!/^[a-f0-9]{24}-(1920|2560)\.webp$/.test(file) || !/^[a-z0-9]+$/i.test(collectionId)) return new NextResponse(null, { status: 404 });

  if (!(await mayReadCollectionMedia(collectionId))) return new NextResponse(null, { status: 404 });

  const abs = path.join(MEDIA_DIR, "wallpapers", collectionId, file);
  try {
    const s = await stat(abs);
    return new NextResponse(Readable.toWeb(createReadStream(abs)) as ReadableStream, {
      headers: { "content-type": "image/webp", "content-length": String(s.size), "cache-control": "private, max-age=3600" },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
