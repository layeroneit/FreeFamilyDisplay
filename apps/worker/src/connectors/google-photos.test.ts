import assert from "node:assert/strict";
import test from "node:test";
import { classifyLink, driveFolderId, extractAlbumImageUrls } from "./google-photos.ts";

test("classifies Google links and rejects everything else", () => {
  assert.equal(classifyLink("https://photos.app.goo.gl/AbCdEf123"), "google-photos");
  assert.equal(classifyLink("https://photos.google.com/share/AF1Q?key=xyz"), "google-photos");
  assert.equal(classifyLink("https://drive.google.com/drive/folders/1AbC_dEf-123?usp=sharing"), "google-drive");
  assert.equal(classifyLink("https://drive.google.com/file/d/123/view"), null);
  assert.equal(classifyLink("https://example.com/album"), null);
  assert.equal(classifyLink("not a url"), null);
});

test("extracts deduplicated image base URLs from album HTML and ignores avatars", () => {
  const html = `
    <script>["https://lh3.googleusercontent.com/pw/AP1GczM_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghijklmnop=w1200-h800-no",
    "https://lh3.googleusercontent.com/pw/AP1GczM_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghijklmnop=w400",
    "https://lh3.googleusercontent.com/a/short=s64-c",
    "https://lh3.googleusercontent.com/pw/AP1GczNzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz=w2048"]</script>`;
  const urls = extractAlbumImageUrls(html);
  assert.equal(urls.length, 2);
  assert.ok(urls.every((u) => !u.includes("=")));
});

test("drive folder id", () => {
  assert.equal(driveFolderId("https://drive.google.com/drive/folders/1AbC_dEf-123?usp=sharing"), "1AbC_dEf-123");
  assert.equal(driveFolderId("https://drive.google.com/drive/my-drive"), null);
});
