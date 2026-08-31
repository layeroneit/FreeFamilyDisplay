/**
 * Renders the marketing screenshot of a board: docs/images/demo-board.webp.
 *
 *     npx tsx scripts/render-demo-board.ts
 *
 * Everything in the picture is invented except the photographs, which are the
 * ones this project already ships and already credits in ATTRIBUTION.md. That
 * is the point of generating it rather than screenshotting a live wall: a real
 * family display is a photograph of a real family beside a timetable of where
 * their children are on which afternoons, and it is not going in a public
 * repository. The photo credit is rendered into the image because the licence
 * requires it wherever the photo appears.
 *
 * The seasonal decor is imported from the real module, so the leaves in the
 * picture are the leaves the app draws.
 */

import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { SEASON_DECOR, seasonalFrame } from "../apps/web/lib/board/season";

const ROOT = join(import.meta.dirname, "..");
const PUBLIC = join(ROOT, "apps/web/public");
const OUT_DIR = join(ROOT, "docs/images");
const OUT = join(OUT_DIR, "demo-board.webp");

const W = 1920;
const H = 1080;

/** Midnight, the default theme (apps/web/app/globals.css). */
const T = {
  surface: "rgb(27,39,69,0.82)",
  border: "#2b3a60",
  text: "#f0ebe0",
  muted: "#8fa0c4",
  a1: "#ffd23f",
  a2: "#2ee6f6",
};
const FONT = "DejaVu Sans, Verdana, Arial, Helvetica, sans-serif";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Greedy wrap to `max` characters, at most `lines` lines, ellipsis if cut. */
function wrap(text: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(" ")) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= max) {
      cur = next;
      continue;
    }
    out.push(cur);
    cur = word;
    if (out.length === lines) break;
  }
  if (cur && out.length < lines) out.push(cur);
  if (out.length === lines && out.join(" ").length < text.length) {
    out[lines - 1] = `${out[lines - 1]!.slice(0, max - 1)}…`;
  }
  return out.filter(Boolean);
}

function card(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${T.surface}" stroke="${T.border}" stroke-width="1"/>`;
}

function text(
  x: number,
  y: number,
  s: string,
  o: { size?: number; fill?: string; weight?: number; anchor?: string; spacing?: number } = {},
): string {
  const { size = 20, fill = T.text, weight = 400, anchor = "start", spacing } = o;
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${
    spacing ? ` letter-spacing="${spacing}"` : ""
  }>${esc(s)}</text>`;
}

// ---------------------------------------------------------------- the week

const DAYS = ["THU", "FRI", "SAT", "SUN", "MON", "TUE", "WED"];
const NUMS = [8, 9, 10, 11, 12, 13, 14];
const EVENTS: { t?: string; s: string }[][] = [
  [{ t: "3:30", s: "Soccer" }, { t: "6 PM", s: "Book club" }],
  [{ s: "Pizza night" }, { t: "7 PM", s: "Movie night" }],
  [{ t: "9 AM", s: "Farmers mkt" }, { t: "2 PM", s: "Piano recital" }, { t: "6 PM", s: "Dinner at Nana's" }],
  [{ s: "Grandma visiting" }, { t: "4 PM", s: "Leaf raking" }],
  [{ t: "7:15", s: "Bus — early" }, { t: "4 PM", s: "Piano lesson" }, { t: "6 PM", s: "Scouts" }],
  [{ t: "9:30", s: "Dentist" }, { t: "5 PM", s: "Swim team" }],
  [{ s: "Trash out" }, { t: "5 PM", s: "Robotics" }, { t: "7 PM", s: "Choir" }],
];

function calendar(): string {
  const x = 40;
  const y = 200;
  const w = 1300;
  const h = 560;
  const ix = x + 24;
  const iy = y + 24;
  const iw = w - 48;
  const parts = [card(x, y, w, h)];

  // Month band: month left, year right, accent rule under both.
  parts.push(text(ix, iy + 60, "OCTOBER", { size: 72, weight: 600, spacing: 1 }));
  parts.push(text(ix + iw, iy + 60, "2026", { size: 28, weight: 500, fill: T.muted, anchor: "end" }));
  parts.push(`<rect x="${ix}" y="${iy + 71}" width="${iw}" height="3" fill="${T.a2}"/>`);

  const top = iy + 82;
  const gap = 8;
  const colW = (iw - gap * 6) / 7;
  for (let i = 0; i < 7; i++) {
    const cx = ix + i * (colW + gap);
    parts.push(`<rect x="${cx}" y="${top}" width="${colW}" height="3" fill="${i === 0 ? T.a2 : T.border}"/>`);
    parts.push(text(cx, top + 32, DAYS[i]!, { size: 18, fill: T.muted, spacing: 1 }));
    parts.push(text(cx, top + 76, String(NUMS[i]), { size: 40, weight: 600, fill: i === 0 ? T.a2 : T.text }));
    let ey = top + 108;
    for (const ev of EVENTS[i]!) {
      const lines = wrap(`${ev.t ? `${ev.t} ` : ""}${ev.s}`, 15, 2);
      const blockH = lines.length * 21;
      parts.push(`<rect x="${cx}" y="${ey - 15}" width="3" height="${blockH}" fill="${T.a1}"/>`);
      lines.forEach((ln, k) => parts.push(text(cx + 9, ey + k * 21, ln, { size: 17 })));
      ey += blockH + 10;
    }
  }
  parts.push(text(ix, y + h - 24, `${EVENTS.flat().length} events · updated 3:41 PM`, { size: 16, fill: T.muted }));
  return parts.join("");
}

// ------------------------------------------------------------- other cards

function weather(): string {
  const x = 1400;
  const y = 320;
  const ix = x + 24;
  const p = [card(x, y, 480, 360)];
  p.push(text(ix, y + 52, "Millbrook", { size: 28, weight: 600 }));
  p.push(text(ix, y + 140, "68°", { size: 86, weight: 600 }));
  p.push(text(ix, y + 178, "Partly cloudy", { size: 22, fill: T.muted }));
  const days = [["Fri", "71° / 52°"], ["Sat", "69° / 50°"], ["Sun", "66° / 48°"]];
  days.forEach(([d, t], i) => {
    p.push(text(ix, y + 232 + i * 40, d!, { size: 20, fill: T.muted }));
    p.push(text(ix + 96, y + 232 + i * 40, t!, { size: 20 }));
  });
  return p.join("");
}

function strip(): string {
  const p: string[] = [];
  // Two tspans in one text element: the accent-coloured name flows after the
  // greeting instead of being positioned at a guessed x that the real font
  // width then overruns.
  p.push(
    `<text x="40" y="108" font-family="${FONT}" font-size="64" font-weight="600" fill="${T.text}">Good afternoon, <tspan fill="${T.a1}">Rivera Family</tspan></text>`,
  );
  // PM sits on the clock's baseline to its right, the way the widget draws it.
  p.push(text(1812, 148, "3:42", { size: 112, weight: 600, anchor: "end" }));
  p.push(text(1880, 148, "PM", { size: 32, weight: 500, fill: T.muted, anchor: "end" }));
  p.push(text(1880, 232, "Thursday, October 8", { size: 36, weight: 500, fill: T.muted, anchor: "end" }));

  p.push(card(40, 780, 1300, 120));
  p.push(text(64, 832, "“A house is made of walls and beams; a home is built with love and dreams.”", { size: 30 }));
  p.push(text(64, 872, "— Ralph Waldo Emerson", { size: 20, fill: T.muted }));

  p.push(card(40, 920, 1300, 120));
  p.push(text(64, 978, "Recycling goes out Wednesday. Soccer cleats are in the garage, not the hall.", { size: 30 }));
  return p.join("");
}

/** Fall decor, straight out of the module the app renders from. */
function decor(): string {
  const d = SEASON_DECOR.fall;
  return seasonalFrame("fall", W, H)
    .map((piece) => {
      const g = d.glyphs[piece.glyph]!;
      const filled = Boolean(g.paths?.length || g.circles?.length);
      const k = piece.size / 24;
      const body = [
        ...(g.paths ?? []).map((path) => `<path d="${path}"/>`),
        ...(g.circles ?? []).map((c) => `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}"/>`),
      ].join("");
      const detail = g.detail
        ? `<path d="${g.detail}" fill="none" stroke="${piece.color}" stroke-width="${filled ? 1.3 : 1.7}" stroke-linecap="round" opacity="${filled ? 0.5 : 1}"/>`
        : "";
      return `<g transform="translate(${piece.x + piece.size / 2} ${piece.y + piece.size / 2}) rotate(${piece.rot}) scale(${k}) translate(-12 -12)" opacity="${piece.opacity}" fill="${piece.color}">${body}${detail}</g>`;
    })
    .join("");
}

// ------------------------------------------------------------------- build

type Wallpaper = { basePath: string; suggestedScrimOpacity: number; attribution: { photographer: string; source: string; license: string } };

async function main(): Promise<void> {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, "wallpapers/manifest.json"), "utf8")) as {
    collections: { slug: string; wallpapers: Wallpaper[] }[];
  };
  const wp = manifest.collections
    .flatMap((c) => c.wallpapers)
    .find((x) => x.basePath.endsWith("/andrew-lake-dock"));
  if (!wp) throw new Error("Backdrop wallpaper not found in the manifest.");
  const credit = `${wp.attribution.photographer} · ${wp.attribution.source} · ${wp.attribution.license}`;

  const bg = await sharp(join(PUBLIC, `${wp.basePath}-1920.webp`))
    .resize(W, H, { fit: "cover" })
    .toBuffer();

  // Photo widget: cover-cropped and rounded to match the card.
  const pw = 480;
  const ph = 320;
  const photo = await sharp(join(PUBLIC, "login-photos/game-night-1920.webp"))
    .resize(pw, ph, { fit: "cover" })
    .composite([
      {
        input: Buffer.from(`<svg width="${pw}" height="${ph}"><rect width="${pw}" height="${ph}" rx="14" fill="#fff"/></svg>`),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#000" opacity="${wp.suggestedScrimOpacity.toFixed(3)}"/>
    ${decor()}
    ${strip()}
    ${calendar()}
    ${weather()}
    ${text(W - 16, H - 12, credit, { size: 14, fill: "rgb(255,255,255,0.72)", anchor: "end" })}
  </svg>`;

  mkdirSync(OUT_DIR, { recursive: true });
  await sharp(bg)
    .composite([
      { input: Buffer.from(overlay), top: 0, left: 0 },
      { input: photo, top: 720, left: 1400 },
    ])
    // WebP, not PNG: the same picture is 182 KB instead of 1.3 MB, and this
    // repository is cloned by people who only wanted a wall calendar.
    .webp({ quality: 92 })
    .toFile(OUT);

  process.stdout.write(`Wrote ${OUT}\n`);
  process.stdout.write(`Backdrop: ${credit}\n`);
  process.stdout.write("Photo card: Andrew Turner · Flickr · CC BY 2.0\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exitCode = 1;
});
