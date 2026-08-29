/**
 * Theme preview — TEMPORARY page, approved 2026-08-29.
 *
 * Display-only swatches of the 10 built-in palettes so the operator can see
 * and veto them early. Palettes come from lib/themes.ts (single source, shared
 * with the dashboard picker). Phase 3 builds the real theme system and
 * DELETES this page.
 */

import { THEMES, type ThemeDef } from "@/lib/themes";

function ThemeCard({ theme }: { theme: ThemeDef }) {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ background: theme.bg, borderColor: theme.border }}
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
        The 10 built-in palettes from the plan, as swatches. Sign in and pick one on the
        dashboard to apply it for real — the full theme system (editor, per-board
        selection) arrives in Phase 3 and replaces this page.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {THEMES.map((theme) => (
          <ThemeCard key={theme.id} theme={theme} />
        ))}
      </div>
    </main>
  );
}
