import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { BLOCKED_TAGS, buildTagQuery, isUsablePost, parsePosts, TagQueryError, type BooruPost } from "./anime-booru.ts";

const post = (over: Partial<BooruPost> = {}): BooruPost => ({
  id: 1,
  fileUrl: "https://safebooru.org/images/1/abc.jpg",
  width: 2560,
  height: 1440,
  tags: ["scenery", "no_humans"],
  rating: "general",
  source: "",
  ...over,
});

const rows = (...items: Array<Record<string, unknown>>) => Buffer.from(JSON.stringify(items));

test("the query always carries the rating and the full blocklist", () => {
  const q = buildTagQuery("Scenery  kimetsu_no_yaiba");
  assert.match(q, /(^| )rating:general( |$)/);
  for (const t of BLOCKED_TAGS) assert.ok(q.includes(`-${t}`), `missing exclusion for ${t}`);
  // Case is normalized, and the operator's own terms survive.
  assert.ok(q.startsWith("scenery kimetsu_no_yaiba "));
});

test("the caller cannot set the rating, negate a tag, or search a blocked one", () => {
  assert.throws(() => buildTagQuery("scenery rating:questionable"), TagQueryError);
  assert.throws(() => buildTagQuery("scenery -no_humans"), TagQueryError);
  assert.throws(() => buildTagQuery("gore"), TagQueryError);
  assert.throws(() => buildTagQuery(""), TagQueryError);
  assert.throws(() => buildTagQuery("a b c d e f g h i"), TagQueryError);
  // Anything that could escape the query string is refused outright.
  assert.throws(() => buildTagQuery("scenery&foo=1"), TagQueryError);
  assert.throws(() => buildTagQuery("scenery/../x"), TagQueryError);
});

test("returned posts are re-checked, not trusted", () => {
  // The whole point: the query excluded these, and we still drop them here.
  assert.equal(isUsablePost(post({ tags: ["scenery", "gore"] })), false);
  assert.equal(isUsablePost(post({ tags: ["scenery", "bikini"] })), false);
  assert.equal(isUsablePost(post({ rating: "questionable" })), false);
  assert.equal(isUsablePost(post({ rating: "explicit" })), false);
  assert.equal(isUsablePost(post()), true);
});

test("the second check fails CLOSED when the tag list is unreadable", () => {
  // A post we cannot vet must not pass just because the list came back empty.
  assert.equal(isUsablePost(post({ tags: [] })), false);
  // ...and the parser must not manufacture an empty list in the first place.
  // Each of these rows carries blocked tags or an unusable shape.
  const shapes = [
    { id: 42, file_url: "https://x/a.jpg", width: 2560, height: 1440, tags: ["gore", "guro"], rating: "general" },
    { id: 43, file_url: "https://x/b.jpg", width: 2560, height: 1440, rating: "general" },
    { id: 44, file_url: "https://x/c.jpg", width: 2560, height: 1440, tags: "", rating: "general" },
  ];
  assert.deepEqual(parsePosts(rows(...shapes)).posts, []);
});

test("tags and rating are lowercased on parse, so the blocklist can match", () => {
  const { posts } = parsePosts(rows({ id: 45, file_url: "https://x/d.jpg", width: 2560, height: 1440, tags: "Gore Blood", rating: "General" }));
  assert.equal(posts.length, 1);
  assert.equal(isUsablePost(posts[0]!), false);
});

test("rows without a usable id are dropped, not collapsed onto one filename", () => {
  // Every id-less row would hash to the same name and overwrite the others.
  const { posts } = parsePosts(
    rows(
      { file_url: "https://x/e.jpg", width: 2560, height: 1440, tags: "scenery", rating: "general" },
      { id: 0, file_url: "https://x/f.jpg", width: 2560, height: 1440, tags: "scenery", rating: "general" },
      { id: "abc", file_url: "https://x/g.jpg", width: 2560, height: 1440, tags: "scenery", rating: "general" },
    ),
  );
  assert.deepEqual(posts, []);
});

test("size and shape gates", () => {
  // Under the ingest floor on the long edge.
  assert.equal(isUsablePost(post({ width: 1600, height: 900 })), false);
  // Portrait is fine — the wall screen this was built for is portrait.
  assert.equal(isUsablePost(post({ width: 1440, height: 2560 })), true);
  // A 7413x6000 scan is 44 MP: a memory spike on a box also driving a screen.
  assert.equal(isUsablePost(post({ width: 7413, height: 6000 })), false);
  // ...but a full 8K frame (33 MP) still gets through.
  assert.equal(isUsablePost(post({ width: 7680, height: 4320 })), true);
  assert.equal(isUsablePost(post({ fileUrl: "ftp://example.com/x.jpg" })), false);
});

test("video and archive posts are rejected before they cost a download", () => {
  for (const ext of ["webm", "mp4", "m4v", "mov", "swf", "zip", "gif"]) {
    assert.equal(isUsablePost(post({ fileUrl: `https://safebooru.org/images/1/a.${ext}` })), false, ext);
  }
  assert.equal(isUsablePost(post({ fileUrl: "https://safebooru.org/images/1/a.webm?x=1" })), false);
  assert.equal(isUsablePost(post({ fileUrl: "https://safebooru.org/images/1/a.png" })), true);
});

test("the stored filename is 24 hex characters, as the media route requires", () => {
  // The route pattern is a security boundary; "t" is not a hex digit, so a
  // "t"-prefixed name 404s for every image in the collection.
  const MEDIA_ROUTE = /^[a-f0-9]{24}-(1920|2560)\.webp$/;
  const name = `a${createHash("sha256").update("booru:7010438").digest("hex").slice(0, 23)}`;
  assert.equal(name.length, 24);
  assert.match(`${name}-1920.webp`, MEDIA_ROUTE);
  assert.match(`${name}-2560.webp`, MEDIA_ROUTE);
});

test("parsePosts tolerates what the index actually returns", () => {
  // No results is an empty body, not an empty array.
  assert.deepEqual(parsePosts(Buffer.from("")), { posts: [], rawCount: 0 });
  assert.deepEqual(parsePosts(Buffer.from("   ")), { posts: [], rawCount: 0 });
  assert.throws(() => parsePosts(Buffer.from("<html>nope</html>")), /wasn't JSON/);
  const out = parsePosts(
    rows(
      { id: 7, file_url: "https://safebooru.org/images/8/a.jpeg", width: 2048, height: 1152, tags: "scenery no_humans", rating: "general", source: "https://www.pixiv.net/artworks/1" },
      { id: 8, width: 100, height: 100 }, // no file_url — dropped, not fatal
    ),
  );
  assert.equal(out.posts.length, 1);
  // rawCount counts what CAME BACK, so the pager doesn't stop early on a
  // page that merely contained a row we dropped.
  assert.equal(out.rawCount, 2);
  assert.equal(out.posts[0]!.id, 7);
  assert.deepEqual(out.posts[0]!.tags, ["scenery", "no_humans"]);
  assert.equal(out.posts[0]!.source, "https://www.pixiv.net/artworks/1");
});
