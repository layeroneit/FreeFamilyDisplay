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
import { PETAL_GLYPH, SEASON_DECOR, seasonalFall } from "../apps/web/lib/board/season";

const ROOT = join(import.meta.dirname, "..");
const PUBLIC = join(ROOT, "apps/web/public");
const OUT_DIR = join(ROOT, "docs/images");
const OUT = join(OUT_DIR, "demo-board.webp");
const OUT_PORTRAIT = join(OUT_DIR, "demo-board-portrait.webp");

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

/**
 * Fall decor, straight out of the module the app renders from. Draws into a
 * box rather than the whole board: the app lines the inside of the CALENDAR
 * CARD, so that the board is left to the wallpaper and the weather layer and
 * leaves never end up drawn on top of the rain.
 */
function decor(w: number, h: number): string {
  // A still cannot show motion, so it shows first paint: every piece has a
  // negative animation-delay, so at t=0 it is delay/dur of the way down its
  // fall. This is exactly what the wall shows the instant the page loads.
  return seasonalFall("fall", w, h)
    .map((p) => {
      if (p.kind !== "glyph") return "";
      const g = p.glyph < 0 ? PETAL_GLYPH : SEASON_DECOR.fall.glyphs[p.glyph]!;
      const filled = Boolean(g.paths?.length || g.circles?.length);
      const pr = (p.delay % p.dur) / p.dur;
      const y = -p.size * 1.5 + pr * (h + p.size * 3);
      if (y > h) return "";
      // Descent drifts linearly with the wind; the flutter pendulum is at
      // whatever phase its own clock puts it at.
      const phase = ((p.delay % p.flutterDur) / p.flutterDur) * Math.PI * 2;
      const x = p.x + pr * p.drift + Math.sin(phase) * p.sway;
      const rot = Math.sin(phase) * p.rock;
      const k = p.size / 24;
      const body = [
        ...(g.paths ?? []).map((path) => `<path d="${path}"/>`),
        ...(g.circles ?? []).map((c) => `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}"/>`),
      ].join("");
      let strokes = "";
      if (g.detail) strokes += `<path d="${g.detail}" fill="none" stroke="${p.color}" stroke-width="${filled ? 1.5 : 1.7}" stroke-linecap="round" stroke-linejoin="round"/>`;
      if (g.veins) strokes += `<path d="${g.veins}" fill="none" stroke="rgb(0 0 0 / 0.38)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;
      return `<g transform="translate(${(x + p.size / 2).toFixed(1)} ${(y + p.size / 2).toFixed(1)}) rotate(${rot.toFixed(0)}) scale(${k.toFixed(3)}) translate(-12 -12)" opacity="${p.opacity}" fill="${p.color}">${body}${strokes}</g>`;
    })
    .join("");
}

/** Wraps decor in the card's interior, in the card's own zoomed units. */
function cardDecor(x: number, y: number, w: number, h: number): string {
  const scale = Math.min(4, Math.max(0.5, Math.sqrt((w * h) / (1300 * 560))));
  // Clipped to the card, because the real widget clips: a leaf mid-entry must
  // not float above the card in the still.
  const id = `clip${x}x${y}`;
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/></clipPath><g clip-path="url(#${id})"><g transform="translate(${x + 24} ${y + 24}) scale(${scale.toFixed(4)})">${decor((w - 48) / scale, (h - 48) / scale)}</g></g>`;
}

// ------------------------------------------------------------------- build

/** The photo widget's walnut-and-matte frame, drawn as rings over the still. */
function photoFrameOverlay(x: number, y: number, w: number, h: number): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="14" y="14" width="${w - 28}" height="${h - 28}" fill="none" stroke="#F2EDE2" stroke-width="16"/>
    <rect x="6" y="6" width="${w - 12}" height="${h - 12}" rx="6" fill="none" stroke="#5b3c22" stroke-width="12"/>
  </svg>`;
  void x; void y;
  return Buffer.from(svg);
}

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
    ${strip()}
    ${calendar()}
    ${cardDecor(40, 200, 1300, 560)}
    ${weather()}
    ${text(W - 16, H - 12, credit, { size: 14, fill: "rgb(255,255,255,0.72)", anchor: "end" })}
  </svg>`;

  mkdirSync(OUT_DIR, { recursive: true });
  await sharp(bg)
    .composite([
      { input: Buffer.from(overlay), top: 0, left: 0 },
      { input: photo, top: 720, left: 1400 },
      { input: photoFrameOverlay(1400, 720, 480, 320), top: 720, left: 1400 },
    ])
    // WebP, not PNG: the same picture is 182 KB instead of 1.3 MB, and this
    // repository is cloned by people who only wanted a wall calendar.
    .webp({ quality: 92 })
    .toFile(OUT);

  process.stdout.write(`Wrote ${OUT}\n`);
  process.stdout.write(`Backdrop: ${credit}\n`);
  process.stdout.write("Photo card: Andrew Turner · Flickr · CC BY 2.0\n");
  await renderPortrait();
}


// ------------------------------------------------------------ portrait board

/**
 * The portrait board (1080x1920), which is what a screen turned on its side in
 * a hallway shows. Its calendar is drawn as day-rows, because seven columns in
 * 1000px would be ~129px each and the app switches layout below 150.
 *
 * The calendar's contents are written in the widget's own layout units inside a
 * single scale() group - exactly what the `zoom` on the real widget does - so
 * the numbers here are the numbers in calendar-view.tsx.
 */
const PORTRAIT_ROWS: { day: string; n: number; evs: { t?: string; s: string }[] }[] = [
  { day: "THU", n: 8, evs: [{ t: "3:30", s: "Soccer practice" }, { t: "6 PM", s: "Book club" }] },
  { day: "FRI", n: 9, evs: [{ s: "Pizza night" }, { t: "7 PM", s: "Movie night" }] },
  { day: "SAT", n: 10, evs: [{ t: "9 AM", s: "Farmers market" }, { t: "2 PM", s: "Piano recital" }, { t: "6 PM", s: "Dinner at Nana's" }] },
  { day: "SUN", n: 11, evs: [{ s: "Grandma visiting" }, { t: "4 PM", s: "Leaf raking" }] },
  { day: "MON", n: 12, evs: [{ t: "7:15", s: "Bus leaves early" }, { t: "4 PM", s: "Piano lesson" }, { t: "6 PM", s: "Scouts" }] },
  { day: "TUE", n: 13, evs: [{ t: "9:30", s: "Dentist — both kids" }, { t: "5 PM", s: "Swim team" }] },
  { day: "WED", n: 14, evs: [{ s: "Trash out" }, { t: "5 PM", s: "Robotics club" }, { t: "7 PM", s: "Choir" }] },
];

function portraitCalendar(x: number, y: number, w: number, h: number): string {
  const scale = Math.min(4, Math.max(0.5, Math.sqrt((w * h) / (1300 * 560))));
  const boxW = (w - 48) / scale;
  const boxH = (h - 48) / scale;
  const EV_SIZE = 21;
  const EV_H = EV_SIZE * 1.25 + 4;
  const CHROME = 16;
  const rowH = (boxH - 87 - 30) / 7;
  const perDay = Math.min(6, Math.max(1, Math.floor((rowH - CHROME) / EV_H)));

  const g: string[] = [];
  g.push(text(0, 58, "OCTOBER", { size: 72, weight: 600, spacing: 1 }));
  g.push(text(boxW, 58, "2026", { size: 28, weight: 500, fill: T.muted, anchor: "end" }));
  g.push(`<rect x="0" y="76" width="${boxW}" height="3" fill="${T.a2}"/>`);

  let cy = 87;
  PORTRAIT_ROWS.forEach((r, i) => {
    const shown = r.evs.slice(0, perDay);
    const rest = r.evs.length - shown.length;
    const bodyH = Math.max(34, shown.length * EV_H + (rest > 0 ? 26 : 0));
    g.push(`<rect x="0" y="${cy}" width="${boxW}" height="2" fill="${i === 0 ? T.a2 : T.border}"/>`);
    const top = cy + 9;
    g.push(text(0, top + 27, String(r.n), { size: 34, weight: 600, fill: i === 0 ? T.a2 : T.text }));
    g.push(text(String(r.n).length > 1 ? 66 : 50, top + 27, r.day, { size: 19, fill: T.muted, spacing: 1 }));
    shown.forEach((ev, k) => {
      const ly = top + 20 + k * EV_H;
      g.push(`<rect x="144" y="${ly - 16}" width="3" height="${EV_SIZE + 4}" fill="${T.a1}"/>`);
      if (ev.t) g.push(text(156, ly, ev.t, { size: EV_SIZE, fill: T.muted }));
      g.push(text(156 + (ev.t ? ev.t.length * 12 + 10 : 0), ly, ev.s, { size: EV_SIZE }));
    });
    if (rest > 0) g.push(text(156, top + 20 + shown.length * EV_H, `+${rest} more`, { size: 19, fill: T.muted }));
    cy += 2 + 7 + bodyH + 7;
  });
  g.push(text(0, boxH - 6, `${PORTRAIT_ROWS.flatMap((r) => r.evs).length} events · updated 3:41 PM`, { size: 16, fill: T.muted }));

  return `${card(x, y, w, h)}<g transform="translate(${x + 24} ${y + 24}) scale(${scale.toFixed(4)})">${g.join("")}</g>`;
}

async function renderPortrait(): Promise<void> {
  const PW = 1080;
  const PH = 1920;
  const manifest = JSON.parse(readFileSync(join(PUBLIC, "wallpapers/manifest.json"), "utf8")) as {
    collections: { slug: string; wallpapers: Wallpaper[] }[];
  };
  const wp = manifest.collections.flatMap((c) => c.wallpapers).find((x) => x.basePath.endsWith("/andrew-lake-dock"))!;
  const credit = `${wp.attribution.photographer} · ${wp.attribution.source} · ${wp.attribution.license}`;

  const bg = await sharp(join(PUBLIC, `${wp.basePath}-1920.webp`)).resize(PW, PH, { fit: "cover" }).toBuffer();

  const pw = 1000;
  const ph = 280;
  const photo = await sharp(join(PUBLIC, "login-photos/campfire-1920.webp"))
    .resize(pw, ph, { fit: "cover" })
    .composite([{ input: Buffer.from(`<svg width="${pw}" height="${ph}"><rect width="${pw}" height="${ph}" rx="14" fill="#fff"/></svg>`), blend: "dest-in" }])
    .png()
    .toBuffer();

  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}">
    <rect width="${PW}" height="${PH}" fill="#000" opacity="${wp.suggestedScrimOpacity.toFixed(3)}"/>
    <text x="40" y="112" font-family="${FONT}" font-size="58" font-weight="600" fill="${T.text}">Good afternoon, <tspan fill="${T.a1}">Rivera</tspan></text>
    ${text(40, 268, "3:42", { size: 108, weight: 600 })}
    ${text(292, 268, "PM", { size: 32, weight: 500, fill: T.muted })}
    ${text(40, 350, "Thursday, October 8", { size: 34, weight: 500, fill: T.muted })}
    ${portraitCalendar(40, 400, 1000, 860)}
    ${cardDecor(40, 400, 1000, 860)}
    ${card(40, 1280, 1000, 300)}
    ${text(64, 1336, "Millbrook", { size: 30, weight: 600 })}
    ${text(64, 1428, "68°", { size: 82, weight: 600 })}
    ${text(190, 1428, "Partly cloudy", { size: 24, fill: T.muted })}
    ${text(64, 1500, "Fri  71° / 52°     Sat  69° / 50°     Sun  66° / 48°", { size: 22, fill: T.muted })}
    ${text(PW - 16, PH - 12, credit, { size: 14, fill: "rgb(255,255,255,0.72)", anchor: "end" })}
  </svg>`;

  await sharp(bg)
    .composite([
      { input: Buffer.from(overlay), top: 0, left: 0 },
      { input: photo, top: 1600, left: 40 },
      { input: photoFrameOverlay(40, 1600, 1000, 280), top: 1600, left: 40 },
    ])
    .webp({ quality: 92 })
    .toFile(OUT_PORTRAIT);
  process.stdout.write(`Wrote ${OUT_PORTRAIT} (day-rows week, perDay from the real budget)\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exitCode = 1;
});
