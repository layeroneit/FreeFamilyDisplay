/**
 * Theme preview — TEMPORARY page, approved 2026-08-29.
 *
 * Shows the 10 built-in theme palettes from plan §7.5 as swatch cards so the
 * operator can see and veto them early. This is display-only: no theme system,
 * no boards, no persistence — Phase 3 builds the real thing (tokens, editor
 * integration, per-board selection) and DELETES this page.
 *
 * The palette values are copied verbatim from the plan table. If Phase 3's
 * token definitions ever disagree with these, the plan wins and this page is
 * already gone.
 */

type ThemePreview = {
  id: string;
  name: string;
  note?: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accents: [string, string, string, string];
};

const THEMES: ThemePreview[] = [
  {
    id: "midnight",
    name: "Midnight",
    note: "default",
    bg: "#101B33",
    surface: "#1B2745",
    text: "#F0EBE0",
    muted: "#8FA0C4",
    accents: ["#FFD23F", "#2EE6F6", "#86E57F", "#FF8A5B"],
  },
  {
    id: "deep-space",
    name: "Deep space",
    bg: "#05060F",
    surface: "#0E1122",
    text: "#E4E8F5",
    muted: "#7A82A6",
    accents: ["#7DF9FF", "#C77DFF", "#FFD6E0", "#4EA8FF"],
  },
  {
    id: "spring",
    name: "Spring",
    bg: "#F4F9EF",
    surface: "#FFFFFF",
    text: "#23331C",
    muted: "#6B7D62",
    accents: ["#E86A92", "#4C9A3F", "#F2B705", "#5FA8D3"],
  },
  {
    id: "summer",
    name: "Summer",
    bg: "#FFF8E7",
    surface: "#FFFFFF",
    text: "#2B2416",
    muted: "#7D7259",
    accents: ["#FF6B35", "#00A6A6", "#F7B801", "#2E86AB"],
  },
  {
    id: "autumn",
    name: "Autumn",
    bg: "#1E1410",
    surface: "#2C1E17",
    text: "#F5E6D3",
    muted: "#A88B72",
    accents: ["#E8871E", "#C1440E", "#D4A017", "#8A9A5B"],
  },
  {
    id: "winter",
    name: "Winter",
    bg: "#0E1A24",
    surface: "#16283A",
    text: "#EAF4FA",
    muted: "#7E9BB0",
    accents: ["#6FE8FF", "#C8E7F5", "#A9D6E5", "#4A90C2"],
  },
  {
    id: "chalkboard",
    name: "Chalkboard",
    bg: "#2A3230",
    surface: "#333B39",
    text: "#F2F0E6",
    muted: "#9AA39F",
    accents: ["#FFE066", "#7FD1AE", "#FF9AA2", "#A8D0E6"],
  },
  {
    id: "kraft",
    name: "Kraft",
    bg: "#F5F1E8",
    surface: "#FFFFFF",
    text: "#2E2A22",
    muted: "#7A7263",
    accents: ["#C25E2A", "#4A7C59", "#9B5DE5", "#1B7A8C"],
  },
  {
    id: "neon-arcade",
    name: "Neon arcade",
    bg: "#0A0A0F",
    surface: "#14141F",
    text: "#F5F5FF",
    muted: "#6E6E8A",
    accents: ["#FF2E88", "#A8FF3E", "#00E5FF", "#FFB300"],
  },
  {
    id: "nordic",
    name: "Nordic",
    bg: "#ECEFF4",
    surface: "#FFFFFF",
    text: "#2E3440",
    muted: "#6C7A8C",
    accents: ["#5E81AC", "#A3BE8C", "#B48EAD", "#D08770"],
  },
];

function ThemeCard({ theme }: { theme: ThemePreview }) {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ background: theme.bg, borderColor: theme.surface }}
      data-theme-preview={theme.id}
    >
      <div className="p-4">
        <div
          className="rounded-lg p-4"
          style={{ background: theme.surface, boxShadow: "0 2px 8px rgb(0 0 0 / 0.2)" }}
        >
          <div className="text-lg font-semibold" style={{ color: theme.text }}>
            {theme.name}
            {theme.note ? (
              <span className="ml-2 text-xs font-normal" style={{ color: theme.muted }}>
                ({theme.note})
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-sm" style={{ color: theme.muted }}>
            Sat, Aug 29 · 7:41 PM · 72°
          </div>
          <div className="mt-3 flex gap-2">
            {theme.accents.map((accent) => (
              <span
                key={accent}
                title={accent}
                className="h-6 w-6 rounded-full"
                style={{ background: accent }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export const metadata = { title: "Theme preview — FreeFamilyDisplay" };

export default function ThemesPreviewPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1
        className="text-3xl font-semibold tracking-tight"
        style={{ fontFamily: "var(--hearth-font-display)" }}
      >
        Theme preview
      </h1>
      <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--hearth-text-muted)" }}>
        The 10 built-in palettes from the plan, as swatches. Preview only — the real
        theme system (tokens, editor, per-board selection) arrives in Phase 3 and
        replaces this page.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {THEMES.map((theme) => (
          <ThemeCard key={theme.id} theme={theme} />
        ))}
      </div>
    </main>
  );
}
