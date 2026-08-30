/**
 * Generates ATTRIBUTION.md from the two shipped image manifests.
 *
 * Every image committed here is redistributed when someone clones or pulls
 * this repo, and CC BY / CC BY-SA make credit mandatory on redistribution.
 * The app already prints the credit on screen; this is the same information in
 * a form a reader of the source tree can check.
 *
 * Node rather than Python: this is a Node project, and `python3` is not a
 * command on Windows while `python` is not one on most Linux distributions.
 * Depending on either was a portability bug waiting to happen.
 *
 *   node scripts/gen-attribution.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = async (p) => JSON.parse(await readFile(path.join(ROOT, p), "utf8"));

const wall = await read("apps/web/public/wallpapers/manifest.json");
const login = await read("apps/web/public/login-photos/credits.json");

const lines = [];
const w = (t = "") => lines.push(t);

w("# Attribution");
w();
w("Free Family Display ships photographs that other people made and licensed for");
w("reuse. The software is Apache 2.0 (see `LICENSE`); **these images are not** —");
w("each one stays under its own licence, listed below.");
w();
w("Generated from `apps/web/public/wallpapers/manifest.json` and");
w("`apps/web/public/login-photos/credits.json`, which are also what the app reads");
w("to print the credit on screen. Regenerate with `npm run attribution`.");
w();

const licences = new Map();
let total = 0;
const count = (l) => licences.set(l, (licences.get(l) ?? 0) + 1);

w("## Wallpaper collections");
w();
for (const c of wall.collections) {
  w(`### ${c.name}`);
  w();
  if (c.description) {
    w(c.description);
    w();
  }
  w("| Image | Photographer | Source | Licence |");
  w("| --- | --- | --- | --- |");
  for (const img of c.wallpapers) {
    const a = img.attribution;
    const name = img.basePath.replace(/\/$/, "").split("/").pop();
    const src = a.sourceUrl ? `[${a.source}](${a.sourceUrl})` : a.source;
    w(`| \`${name}\` | ${a.photographer} | ${src} | ${a.license} |`);
    count(a.license);
    total++;
  }
  w();
}

w("## Sign-in page photographs");
w();
w("| Image | Photographer | Source | Licence |");
w("| --- | --- | --- | --- |");
for (const p of login) {
  const src = p.sourceUrl ? `[${p.source}](${p.sourceUrl})` : p.source;
  w(`| \`${p.file}\` | ${p.photographer} | ${src} | ${p.license} |`);
  count(p.license);
  total++;
}
w();

w("## Summary");
w();
w(`${total} images in total.`);
w();
w("| Licence | Images |");
w("| --- | --- |");
for (const [lic, n] of [...licences].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  w(`| ${lic} | ${n} |`);
}
w();
w("Share-alike (CC BY-SA) applies to the images themselves and to adaptations of");
w("them. It does not reach the source code, which is separately licensed under");
w("Apache 2.0.");
w();
w("Anything a household adds to its own instance — its own photos, a linked");
w("album, or art fetched by tag — is never committed here and is never");
w("redistributed by this project.");
w();

await writeFile(path.join(ROOT, "ATTRIBUTION.md"), lines.join("\n"), "utf8");

const missing = [
  ...wall.collections.flatMap((c) =>
    c.wallpapers
      .filter((i) => !i.attribution?.photographer || !i.attribution?.license)
      .map((i) => i.basePath),
  ),
  ...login.filter((p) => !p.photographer || !p.license).map((p) => p.file),
];

// The repo bans the console object outright (eslint.config.mjs): it leaks a
// credential exactly as easily as a plain log does, and the sibling scripts
// write to the streams directly. Match that rather than adding disables.
const out = (t) => process.stdout.write(`${t}
`);
const err = (t) => process.stderr.write(`${t}
`);

out(`ATTRIBUTION.md: ${total} images, ${licences.size} distinct licences`);
for (const [lic, n] of [...licences].sort((a, b) => b[1] - a[1])) {
  out(`  ${String(n).padStart(3)}  ${lic}`);
}
if (missing.length) {
  // An image nobody can credit must not ship from a public repo.
  err(`\nMISSING CREDIT on ${missing.length} image(s):`);
  missing.forEach((m) => err(`  ${m}`));
  process.exit(1);
}
const noLink = login.filter((p) => !p.sourceUrl).length;
if (noLink) err(`\nNote: ${noLink} sign-in photo(s) have no sourceUrl.`);
