import type { Metadata, Viewport } from "next";
import { getSessionUser } from "@/lib/auth/sessions";
import { themeById, themeVars } from "@/lib/themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "FreeFamilyDisplay",
  description: "Self-hosted family dashboard.",
  // Invite-only, no public signup (plan §3). Nothing here should be indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101b33",
};

// Session-aware theming: the signed-in user's palette applies to EVERY page,
// not just the dashboard — a theme pick that only recolors one route reads as
// a no-op. Signed-out visitors get the Midnight defaults from globals.css.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser().catch(() => null);
  const vars = user ? themeVars(themeById(user.uiTheme)) : undefined;

  return (
    <html lang="en">
      <body
        className="min-h-dvh antialiased"
        style={{ ...vars, background: "var(--hearth-bg)", color: "var(--hearth-text)" }}
      >
        {children}
      </body>
    </html>
  );
}
