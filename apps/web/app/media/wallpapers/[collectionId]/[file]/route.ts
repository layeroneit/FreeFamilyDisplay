import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@ffd/db";
import { getSessionUser } from "@/lib/auth/sessions";

export const dynamic = "force-dynamic";

const MEDIA_DIR = process.env.MEDIA_DIR ?? "/app/media";

/**
 * Serves a custom-collection wallpaper from the media volume, owner-gated
 * (collections are private to their owner in v1.0 — spec §7). File names are
 * <24-hex>-<1920|2560>.webp written by the worker; anything else is rejected
 * before the filesystem is touched.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ collectionId: string; file: string }> }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { collectionId, file } = await ctx.params;
  if (!/^[a-f0-9]{24}-(1920|2560)\.webp$/.test(file) || !/^[a-z0-9]+$/i.test(collectionId)) return new NextResponse(null, { status: 404 });

  const owned = await prisma.wallpaperCollection.findFirst({ where: { id: collectionId, ownerId: user.id }, select: { id: true } });
  if (!owned) return new NextResponse(null, { status: 404 });

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
