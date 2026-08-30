import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ffd/db";
import { encryptSecret, maskUrl } from "@ffd/crypto";
import { getSessionUser } from "@/lib/auth/sessions";
import { termsCurrent } from "@/lib/terms";
import { listCollections } from "@/lib/board/wallpapers";
import { pokeWorkerConnectors } from "@/lib/board/worker-poke";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const MAX_CUSTOM_COLLECTIONS = 10;

const CreateInput = z
  .object({
    name: z.string().trim().min(1, "Give the collection a name.").max(80),
    link: z.string().trim().max(2048).optional(),
    /** A directory name under the server's drop folder — never a path. */
    folder: z
      .string()
      .trim()
      .max(64)
      .regex(/^[A-Za-z0-9 ._-]+$/, "Use a plain folder name — no slashes.")
      .optional(),
    /**
     * Search terms for the public anime image index. Shape-checked here only:
     * the worker owns the real query (it appends the fixed rating and the
     * blocklist) and reports anything wrong through lastError, exactly as the
     * link path does.
     */
    tags: z
      .string()
      .trim()
      .max(200)
      .regex(/^[A-Za-z0-9_.'()+:\s,-]+$/, "Use tags like scenery kimetsu_no_yaiba - letters, digits and underscores.")
      .optional(),
    rightsNote: z.string().trim().max(300).optional(),
  })
  .refine(
    (v) => [v.link, v.folder, v.tags].filter(Boolean).length === 1,
    "Give exactly one source: a link, a folder, or tags.",
  );

/** Shallow guard so obvious mistakes answer immediately instead of via lastError. */
function checkTags(raw: string): string {
  const terms = raw.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (terms.length === 0) throw new Error("Add at least one tag, for example: scenery kimetsu_no_yaiba");
  if (terms.length > 8) throw new Error("Use at most 8 tags - more tags means fewer matches, not better ones.");
  // The rating is the worker's to set, and exclusions are always applied.
  if (terms.some((t) => t.startsWith("rating:"))) throw new Error("Rating is fixed for safety and can't be set here.");
  if (terms.some((t) => t.startsWith("-"))) throw new Error("Excluding tags isn't supported - the safety exclusions are always applied.");
  return terms.join(" ");
}

function checkGoogleLink(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a valid link.");
  }
  if (u.protocol !== "https:") throw new Error("Only https:// links are allowed.");
  const h = u.hostname.toLowerCase();
  const ok = h === "photos.app.goo.gl" || h === "photos.google.com" || (h === "drive.google.com" && /\/folders\/[A-Za-z0-9_-]+/.test(u.pathname));
  if (!ok) throw new Error("Paste a Google Photos shared-album link or a Google Drive folder link.");
  return u.toString();
}

/** Collections the signed-in user may choose from: built-ins plus their own. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ collections: await listCollections(user.id) });
}

/**
 * "Add your own" (spec §7): a private collection fed from a pasted link.
 * The link is a credential — encrypted at rest, masked in responses.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!termsCurrent(user)) return NextResponse.json({ error: "Accept the agreement first." }, { status: 403 });

  const parsed = CreateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });

  const count = await prisma.wallpaperCollection.count({ where: { ownerId: user.id } });
  if (count >= MAX_CUSTOM_COLLECTIONS) {
    return NextResponse.json({ error: `You've reached the limit of ${MAX_CUSTOM_COLLECTIONS} collections. Delete one to add another.` }, { status: 400 });
  }

  const slug = `c_${user.id.slice(-6)}_${Date.now().toString(36)}`;
  const rightsNote = parsed.data.rightsNote || null;

  if (parsed.data.tags) {
    let tags: string;
    try {
      tags = checkTags(parsed.data.tags);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid tags." }, { status: 400 });
    }
    // Not a credential: the operator typed these and needs to see them to edit
    // them. A rights note is forced on, because this collection is other
    // people's artwork and the board says so on screen.
    const created = await prisma.wallpaperCollection.create({
      data: {
        slug,
        ownerId: user.id,
        name: parsed.data.name,
        isBuiltin: false,
        sourceTags: tags,
        rightsNote: rightsNote ?? "Fan art - rights remain with the original artists.",
      },
      select: { id: true },
    });
    await audit({ actorId: user.id, action: "wallpapers.collection.created", targetType: "WallpaperCollection", targetId: created.id });
    pokeWorkerConnectors();
    return NextResponse.json({ id: created.id }, { status: 201 });
  }

  if (parsed.data.folder) {
    // A folder on the server the operator already filled — nothing to fetch,
    // nothing secret, so it is stored and shown in the clear.
    const created = await prisma.wallpaperCollection.create({
      data: { slug, ownerId: user.id, name: parsed.data.name, isBuiltin: false, sourceFolder: parsed.data.folder, rightsNote },
      select: { id: true },
    });
    await audit({ actorId: user.id, action: "wallpapers.collection.created", targetType: "WallpaperCollection", targetId: created.id });
    pokeWorkerConnectors();
    return NextResponse.json({ id: created.id }, { status: 201 });
  }

  let link: string;
  try {
    link = checkGoogleLink(parsed.data.link!);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid link." }, { status: 400 });
  }

  // Two-step so the ciphertext is bound to the row id.
  const created = await prisma.wallpaperCollection.create({
    data: { slug, ownerId: user.id, name: parsed.data.name, isBuiltin: false, sourceMask: maskUrl(link), rightsNote },
    select: { id: true },
  });
  await prisma.wallpaperCollection.update({ where: { id: created.id }, data: { sourceSecret: encryptSecret(link, `collection:${created.id}`) } });
  await audit({ actorId: user.id, action: "wallpapers.collection.created", targetType: "WallpaperCollection", targetId: created.id });
  pokeWorkerConnectors();
  return NextResponse.json({ id: created.id }, { status: 201 });
}
