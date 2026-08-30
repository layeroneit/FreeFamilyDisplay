/**
 * Wallpaper collections filled by TAG from a public anime image index
 * (Safebooru). The operator names the tags they want — `kimetsu_no_yaiba`,
 * `scenery`, `shingeki_no_kyojin` — and the worker pulls matching images onto
 * this household's own disk on the connector cycle.
 *
 * WHY THIS EXISTS AND WHAT IT DELIBERATELY IS NOT
 *
 * The spec (§6) says "do not ship a scraper, do not add a franchise-term image
 * search", and built-in collections stay free-license only. That rule is about
 * what *this project* redistributes: the repo is public and the built-ins bake
 * into the Docker image, so committing franchise art would be redistribution by
 * us, and a disclaimer is not a licence. None of that changes.
 *
 * This path is the other side of that line. Nothing is committed and nothing
 * ships in the image — the operator points their own instance at tags they
 * chose, and the files land on their own media volume, on their own machine,
 * behind their own login, for their own wall. It is the same act as saving a
 * picture to your desktop. The images are still other people's work: every
 * wallpaper carries the artist's source link where the index has one, and the
 * collection carries a rights note that says so on screen.
 *
 * TWO SAFETY PROPERTIES, both enforced here and neither optional:
 *
 * 1. `rating:general` and BLOCKED_TAGS are appended to every query by this
 *    module, not supplied by the caller, and the tags that come *back* are
 *    re-checked against the same blocklist before anything is downloaded.
 *    Server-side exclusion is a request to someone else's database — if a term
 *    is renamed or the parameter is silently dropped, the second check is what
 *    actually holds. This is a screen on a family's wall; it fails closed.
 * 2. The index's rating is crowd-tagged, not verified. It reliably excludes
 *    sexual content and does NOT reliably exclude gore, violence, or otherwise
 *    upsetting imagery — hence the blocklist above and beyond the rating, and
 *    hence the honest wording in the UI. Reduced risk, not a guarantee.
 */

import { createHash } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@ffd/db";
import { createLogger } from "@ffd/log";
import { safeFetch, UnsafeUrlError } from "../net/ssrf.js";
import { ingestWallpaper } from "../wallpaper-ingest.js";

const log = createLogger("worker.booru");

const API = "https://safebooru.org/index.php";
const POST_PAGE = "https://safebooru.org/index.php?page=post&s=view&id=";
const PAGE_SIZE = 100;
const MAX_PAGES = 6;
/** Enough for a long rotation without turning a wall display into an archive. */
const MAX_PER_COLLECTION = 40;
const MAX_IMAGE_BYTES = 24 * 1024 * 1024;
/** A wallpaper needs this on its long edge; matches the ingest floor (spec §4). */
const MIN_LONG_EDGE = 1920;
/**
 * Reject absurdly large source images before spending a download on them. Some
 * indexed posts are 7000x6000 scans - 44 megapixels, and decoding one is a
 * memory spike on a box that is also driving a screen. 40 clears a full 8K
 * frame (33 MP) with room to spare, so nothing worth having is lost.
 */
const MAX_MEGAPIXELS = 40;

/**
 * Excluded from every query AND re-checked on every returned post. Covers what
 * `rating:general` does not: gore and violence, apparent-minor tags, and the
 * suggestive-but-not-explicit band that a rating of "general" still admits.
 */
export const BLOCKED_TAGS: readonly string[] = [
  "loli",
  "shota",
  "guro",
  "gore",
  "blood",
  "death",
  "corpse",
  "hanging",
  "suicide",
  "violence",
  "weapon",
  "gun",
  "knife",
  "nude",
  "nudity",
  "topless",
  "see-through",
  "underwear",
  "lingerie",
  "panties",
  "bra",
  "swimsuit",
  "bikini",
  "cleavage",
  "ass",
  "upskirt",
  "skirt_lift",
  "wardrobe_malfunction",
  "sensitive",
  "suggestive",
];

const BLOCKED = new Set(BLOCKED_TAGS);

/** One post as the index returns it. Only the fields we actually rely on. */
export type BooruPost = {
  id: number;
  fileUrl: string;
  width: number;
  height: number;
  tags: string[];
  rating: string;
  /** The original artist's page, when the uploader recorded one. Often blank. */
  source: string;
};

/**
 * The index carries video and archive posts too. They have width/height and
 * would pass every other gate, then waste a full download before the
 * content-type check rejects them - and each one costs a slot.
 */
const NON_IMAGE = /\.(webm|mp4|m4v|mov|swf|zip|gif)$/i;

/** A single search term: lowercase, and nothing that could escape the query. */
const TAG = /^[a-z0-9_.'()+:-]{1,64}$/;

export class TagQueryError extends Error {}

/**
 * Turns what the operator typed into the tag string we send. Throws with
 * something they can act on rather than silently searching for the wrong
 * thing.
 *
 * The forced terms are appended here so there is exactly one place that
 * decides what a query is allowed to ask for. Exported for tests.
 */
export function buildTagQuery(input: string): string {
  const wanted = input
    .trim()
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((t) => t.length > 0);
  if (wanted.length === 0) throw new TagQueryError("Add at least one tag, for example: scenery kimetsu_no_yaiba");
  if (wanted.length > 8) throw new TagQueryError("Use at most 8 tags — more tags means fewer matches, not better ones.");
  for (const t of wanted) {
    if (!TAG.test(t)) throw new TagQueryError(`"${t}" isn't a usable tag. Use letters, digits and underscores, like shingeki_no_kyojin.`);
    // The rating is ours to set. A second rating: term would either fight ours
    // or quietly widen what comes back.
    if (t.startsWith("rating:")) throw new TagQueryError("Rating is fixed for safety and can't be set here.");
    if (t.startsWith("-")) throw new TagQueryError("Excluding tags isn't supported here — the safety exclusions are always applied.");
    if (BLOCKED.has(t)) throw new TagQueryError(`"${t}" is on the blocked list and can't be searched for.`);
  }
  return [...wanted, "rating:general", ...BLOCKED_TAGS.map((t) => `-${t}`)].join(" ");
}

/**
 * Parses a search response. The index answers an empty body for "no results".
 *
 * Every row that is not exactly the shape we expect is DROPPED, never
 * defaulted. That matters most for `tags`: coercing a missing or
 * unexpectedly-typed tag list to `[]` would make the blocklist check below
 * pass trivially, turning the second line of defence into a no-op the first
 * time the index changes its JSON. A row we cannot read is a row we do not
 * show.
 *
 * `rawCount` is how many array entries came back, before any of that dropping.
 * The pager needs it: a short page after filtering does not mean a short page
 * upstream.
 */
export function parsePosts(body: Buffer): { posts: BooruPost[]; rawCount: number } {
  const text = body.toString("utf8").trim();
  if (text === "") return { posts: [], rawCount: 0 };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The image index returned something that wasn't JSON.");
  }
  if (!Array.isArray(raw)) return { posts: [], rawCount: 0 };
  const posts: BooruPost[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const fileUrl = typeof o["file_url"] === "string" ? o["file_url"] : "";
    const width = Number(o["width"]);
    const height = Number(o["height"]);
    const id = Number(o["id"]);
    // A row with no usable id would hash to the same filename as every other
    // one, so distinct images would overwrite each other's renditions.
    if (!Number.isInteger(id) || id <= 0) continue;
    if (fileUrl === "" || !Number.isFinite(width) || !Number.isFinite(height)) continue;
    // Fail closed: no readable tag list means we cannot vet this post.
    const rawTags = o["tags"];
    if (typeof rawTags !== "string") continue;
    const tags = rawTags.toLowerCase().split(/\s+/).filter(Boolean);
    if (tags.length === 0) continue;
    posts.push({
      id,
      fileUrl,
      width,
      height,
      tags,
      rating: typeof o["rating"] === "string" ? o["rating"].toLowerCase() : "",
      source: typeof o["source"] === "string" ? o["source"] : "",
    });
  }
  return { posts, rawCount: raw.length };
}

/**
 * The second half of the safety property described at the top of this file:
 * whatever the query asked for, this decides what is actually allowed through.
 * Exported for tests.
 */
export function isUsablePost(p: BooruPost): boolean {
  if (p.rating !== "general" && p.rating !== "safe") return false;
  // An empty tag list is untrusted input, not a clean post.
  if (p.tags.length === 0) return false;
  if (p.tags.some((t) => BLOCKED.has(t))) return false;
  if (NON_IMAGE.test(p.fileUrl.split("?")[0]!)) return false;
  if (Math.max(p.width, p.height) < MIN_LONG_EDGE) return false;
  if ((p.width * p.height) / 1e6 > MAX_MEGAPIXELS) return false;
  // Only http(s) — safeFetch would reject anything else, but not fetching it
  // at all keeps a malformed row from burning a request.
  return /^https?:\/\//.test(p.fileUrl);
}

async function search(tags: string, pid: number): Promise<{ posts: BooruPost[]; rawCount: number }> {
  const url = `${API}?page=dapi&s=post&q=index&json=1&limit=${PAGE_SIZE}&pid=${pid}&tags=${encodeURIComponent(tags)}`;
  const res = await safeFetch(url, { accept: "application/json", maxBytes: 4 * 1024 * 1024 });
  if (res.status !== 200) throw new Error(`The image index answered HTTP ${res.status}.`);
  return parsePosts(res.body);
}

/** Collects up to MAX_PER_COLLECTION usable posts, newest pages first. */
export async function collectPosts(tags: string): Promise<BooruPost[]> {
  const seen = new Set<number>();
  const out: BooruPost[] = [];
  for (let pid = 0; pid < MAX_PAGES && out.length < MAX_PER_COLLECTION; pid++) {
    const { posts, rawCount } = await search(tags, pid);
    if (rawCount === 0) break;
    for (const p of posts) {
      if (out.length >= MAX_PER_COLLECTION) break;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      if (isUsablePost(p)) out.push(p);
    }
    // Short of a full page UPSTREAM means there is nothing after it. Testing
    // the filtered length would stop early any time the index returned a
    // single row we chose to drop.
    if (rawCount < PAGE_SIZE) break;
  }
  return out;
}

export async function syncTagCollections(mediaDir: string): Promise<void> {
  const cols = await prisma.wallpaperCollection.findMany({
    where: {
      sourceTags: { not: null },
      // A household's own tag collection syncs as soon as it exists, because
      // creating one IS the request. A built-in tag theme only syncs once a
      // board has actually selected it -- an install that never picks "Anime"
      // must not quietly download anime onto somebody's family server.
      OR: [{ isBuiltin: false }, { boards: { some: {} } }],
    },
    select: { id: true, sourceTags: true, name: true },
  });
  for (const c of cols) {
    try {
      const posts = await collectPosts(buildTagQuery(c.sourceTags!));
      if (posts.length === 0) {
        throw new Error("No images matched those tags at a usable size. Try a broader tag, like scenery.");
      }
      const dir = path.join(mediaDir, "wallpapers", c.id);
      const keep = new Set<string>();
      let order = 0;
      let added = 0;
      let rejected = 0;
      for (const p of posts) {
        // 24 characters, ALL of them hex: the media route only serves
        // /^[a-f0-9]{24}-(1920|2560)\.webp$/ and that regex is a security
        // boundary, so the marker character has to be a hex digit too.
        // "a" marks a tag-sourced image (folder-fed images use "f"); the rest
        // keys on the post id so a picture keeps its renditions across syncs.
        const name = `a${createHash("sha256").update(`booru:${p.id}`).digest("hex").slice(0, 23)}`;
        const basePath = `/media/wallpapers/${c.id}/${name}`;
        keep.add(name);
        const existing = await prisma.wallpaper.findFirst({ where: { collectionId: c.id, basePath }, select: { id: true } });
        if (existing) {
          await prisma.wallpaper.update({ where: { id: existing.id }, data: { sortOrder: order++ } });
          continue;
        }
        try {
          const img = await safeFetch(p.fileUrl, { accept: "image/*", maxBytes: MAX_IMAGE_BYTES });
          if (img.status !== 200 || !img.contentType.startsWith("image/")) {
            rejected++;
            continue;
          }
          const a = await ingestWallpaper(img.body, dir, name);
          await prisma.wallpaper.create({
            data: {
              collectionId: c.id,
              basePath,
              width: a.width,
              height: a.height,
              meanLuminance: a.meanLuminance,
              luminanceVariance: a.luminanceVariance,
              dominantColors: a.dominantColors,
              suggestedScrimOpacity: a.suggestedScrimOpacity,
              lqip: a.lqip,
              // The index is an index, not the author. Point at the artist's
              // own page when the post records one, and say plainly that the
              // rights are theirs.
              attribution: {
                photographer: "",
                source: "Safebooru",
                license: "Fan art - rights remain with the original artist",
                sourceUrl: /^https?:\/\//.test(p.source) ? p.source : `${POST_PAGE}${p.id}`,
              },
              sortOrder: order++,
            },
          });
          added++;
        } catch (err) {
          // UnsafeUrlError is not only the SSRF verdict - safeFetch also raises
          // it for "too large" and "too many redirects". These URLs come from
          // the index and point at many different hosts, so one bad post must
          // not cost the other thirty-nine; skip it and carry on. A genuinely
          // blocked address is logged rather than silently dropped.
          if (err instanceof UnsafeUrlError) {
            log.warn("image skipped by the fetch guard", { collectionId: c.id, postId: p.id, error: err.message });
          }
          rejected++; // undersized, unreadable, oversized, or a dead link
        }
      }

      const stale = await prisma.wallpaper.findMany({ where: { collectionId: c.id }, select: { id: true, basePath: true } });
      for (const w of stale) {
        const name = w.basePath.split("/").pop()!;
        if (!keep.has(name)) {
          await prisma.wallpaper.delete({ where: { id: w.id } });
          for (const f of await readdir(dir).catch(() => [] as string[])) {
            if (f.startsWith(`${name}-`)) await rm(path.join(dir, f), { force: true });
          }
        }
      }

      const total = await prisma.wallpaper.count({ where: { collectionId: c.id } });
      await prisma.wallpaperCollection.update({
        where: { id: c.id },
        data: {
          lastSyncedAt: new Date(),
          lastError:
            total === 0
              ? "No usable images - wallpapers need at least 1920px on the long edge."
              : rejected > 0
                ? `${rejected} image(s) skipped (too small or unreadable)`
                : null,
        },
      });
      log.info("tag collection synced", { collectionId: c.id, added, rejected, total });
    } catch (err) {
      const text = (err instanceof Error ? err.message : "unknown error").replace(/https?:\/\/\S+/g, "[link]").slice(0, 255);
      await prisma.wallpaperCollection.update({ where: { id: c.id }, data: { lastError: text } }).catch(() => undefined);
      log.warn("tag collection sync failed", { collectionId: c.id, error: text });
    }
  }
}
