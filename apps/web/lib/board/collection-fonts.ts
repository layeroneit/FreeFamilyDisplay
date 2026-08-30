/**
 * A wallpaper collection sets the mood; the lettering should agree with it.
 * Picking "Deep space" and getting the same neutral UI sans as "Kraft" reads
 * as a background swap rather than a theme.
 *
 * These are font *stacks*, not bundled webfonts: the display runs on a LAN
 * with no internet guarantee, so pulling from a font CDN would leave a wall
 * screen rendering fallbacks at the worst moment. Each stack names faces
 * shipped with Windows, macOS and most desktop Linux, then degrades through
 * generic families. A bundled, self-hosted webfont per collection is the
 * follow-up (docs/open-questions.md).
 *
 * Custom collections (any slug not listed) keep the theme's own fonts, except
 * tag-fed anime collections, which ask for the "anime" pair by name because
 * their slug is generated per user (see components/board/render-data.ts).
 */

export type FontPair = { display: string; body: string };

const SYSTEM_BODY = "ui-sans-serif, system-ui, sans-serif";

const COLLECTION_FONTS: Record<string, FontPair> = {
  // Wide, engineered, a little cold — mission-patch lettering.
  "deep-space": {
    display: '"Eurostile", "Bank Gothic", "Michroma", "Trebuchet MS", ui-sans-serif, sans-serif',
    body: '"Roboto Condensed", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
  },
  // Chrome script energy without tipping into novelty.
  "muscle-and-machines": {
    display: '"Racing Sans One", "Impact", "Haettenschweiler", "Arial Narrow Bold", ui-sans-serif, sans-serif',
    body: '"Oswald", "Franklin Gothic Medium", "Segoe UI", ui-sans-serif, sans-serif',
  },
  // Quiet, humanist, outdoorsy.
  mountains: {
    display: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, ui-serif, serif',
    body: '"Avenir Next", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
  },
  // Quiet and cold-weather; a newspaper-masthead serif for the Northwoods.
  northwoods: {
    display: '"Iowan Old Style", "Hoefler Text", "Palatino Linotype", Georgia, ui-serif, serif',
    body: '"Segoe UI", ui-sans-serif, system-ui, sans-serif',
  },
  // Tight grotesque signage - reads like a transit board after dark.
  "cities-at-night": {
    display: '"Helvetica Neue Condensed", "Arial Narrow", "Oswald", "Segoe UI", ui-sans-serif, sans-serif',
    body: '"Inter", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
  },
  // Broadcast-weather weight: heavy, plain, legible across a room.
  storms: {
    display: '"Franklin Gothic Medium", "Haettenschweiler", "Arial Black", "Segoe UI", ui-sans-serif, sans-serif',
    body: '"Roboto Condensed", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
  },
  // The two anime themes ship real bundled faces (app/anime-fonts.css, SIL
  // OFL) rather than hoping a system has something suitable. Mochiy Pop One
  // is the rounded poster face; Hina Mincho is the quieter brush serif for the
  // night set; Noto Sans JP carries body text under both.
  anime: {
    display: '"Mochiy Pop One", "Century Gothic", "Futura", "Trebuchet MS", ui-rounded, ui-sans-serif, sans-serif',
    body: '"Noto Sans JP", "Nunito", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
  },
  "anime-night": {
    display: '"Hina Mincho", "Iowan Old Style", "Palatino Linotype", Georgia, ui-serif, serif',
    body: '"Noto Sans JP", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
  },
  // Warm firelight; a little storybook.
  campfire: {
    display: '"Bookman Old Style", "Chaparral Pro", Georgia, "Times New Roman", ui-serif, serif',
    body: '"Segoe UI", ui-sans-serif, system-ui, sans-serif',
  },
  // Pixel/arcade signage, kept legible at a distance.
  gaming: {
    display: '"Press Start 2P", "OCR A Extended", "Consolas", ui-monospace, monospace',
    body: '"Rajdhani", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
  },
};

/** Token overrides for a collection's lettering, or `{}` to keep the theme's. */
export function collectionFontVars(slug: string | null | undefined): Record<string, string> {
  const f = slug ? COLLECTION_FONTS[slug] : undefined;
  if (!f) return {};
  return { "--hearth-font-display": f.display, "--hearth-font-body": f.body || SYSTEM_BODY };
}

/** Names the collections that carry their own lettering — used by the editor copy. */
export function hasCollectionFonts(slug: string | null | undefined): boolean {
  return Boolean(slug && COLLECTION_FONTS[slug]);
}
