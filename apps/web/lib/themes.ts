/**
 * The 10 built-in theme palettes (plan §7.5), verbatim from the plan table.
 * Single source of truth: the preview page, the dashboard picker, and the
 * authed-page theming all read from here. Phase 3 expands entries with font
 * pairings and decorative layers; ids are stable and stored in User.uiTheme.
 */

export type ThemeDef = {
  id: string;
  name: string;
  note?: string;
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accents: [string, string, string, string];
};

export const DEFAULT_THEME_ID = "midnight";

export const THEMES: ThemeDef[] = [
  { id: "midnight", name: "Midnight", note: "default", bg: "#101B33", surface: "#1B2745", border: "#2B3A60", text: "#F0EBE0", muted: "#8FA0C4", accents: ["#FFD23F", "#2EE6F6", "#86E57F", "#FF8A5B"] },
  { id: "deep-space", name: "Deep space", bg: "#05060F", surface: "#0E1122", border: "#1C2140", text: "#E4E8F5", muted: "#7A82A6", accents: ["#7DF9FF", "#C77DFF", "#FFD6E0", "#4EA8FF"] },
  { id: "spring", name: "Spring", bg: "#F4F9EF", surface: "#FFFFFF", border: "#D8E5CF", text: "#23331C", muted: "#6B7D62", accents: ["#E86A92", "#4C9A3F", "#F2B705", "#5FA8D3"] },
  { id: "summer", name: "Summer", bg: "#FFF8E7", surface: "#FFFFFF", border: "#EFE3C4", text: "#2B2416", muted: "#7D7259", accents: ["#FF6B35", "#00A6A6", "#F7B801", "#2E86AB"] },
  { id: "autumn", name: "Autumn", bg: "#1E1410", surface: "#2C1E17", border: "#45311F", text: "#F5E6D3", muted: "#A88B72", accents: ["#E8871E", "#C1440E", "#D4A017", "#8A9A5B"] },
  { id: "winter", name: "Winter", bg: "#0E1A24", surface: "#16283A", border: "#254358", text: "#EAF4FA", muted: "#7E9BB0", accents: ["#6FE8FF", "#C8E7F5", "#A9D6E5", "#4A90C2"] },
  { id: "chalkboard", name: "Chalkboard", bg: "#2A3230", surface: "#333B39", border: "#48524F", text: "#F2F0E6", muted: "#9AA39F", accents: ["#FFE066", "#7FD1AE", "#FF9AA2", "#A8D0E6"] },
  { id: "kraft", name: "Kraft", bg: "#F5F1E8", surface: "#FFFFFF", border: "#E2DACA", text: "#2E2A22", muted: "#7A7263", accents: ["#C25E2A", "#4A7C59", "#9B5DE5", "#1B7A8C"] },
  { id: "neon-arcade", name: "Neon arcade", bg: "#0A0A0F", surface: "#14141F", border: "#26263A", text: "#F5F5FF", muted: "#6E6E8A", accents: ["#FF2E88", "#A8FF3E", "#00E5FF", "#FFB300"] },
  { id: "nordic", name: "Nordic", bg: "#ECEFF4", surface: "#FFFFFF", border: "#D8DEE9", text: "#2E3440", muted: "#6C7A8C", accents: ["#5E81AC", "#A3BE8C", "#B48EAD", "#D08770"] },
];

export function themeById(id: string | null | undefined): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME_ID)!;
}

export function isThemeId(id: string): boolean {
  return THEMES.some((t) => t.id === id);
}

/** CSS custom-property map for a theme — the --hearth-* token contract. */
export function themeVars(theme: ThemeDef): Record<string, string> {
  return {
    "--hearth-bg": theme.bg,
    "--hearth-surface": theme.surface,
    "--hearth-border": theme.border,
    "--hearth-text": theme.text,
    "--hearth-text-muted": theme.muted,
    "--hearth-accent-1": theme.accents[0],
    "--hearth-accent-2": theme.accents[1],
    "--hearth-accent-3": theme.accents[2],
    "--hearth-accent-4": theme.accents[3],
  };
}
