import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/sessions";
import { THEMES, themeById, themeVars } from "@/lib/themes";
import { ThemePicker } from "./theme-picker";
import { LogoutButton } from "./logout-button";

export const metadata = { title: "Dashboard — FreeFamilyDisplay" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const theme = themeById(user.uiTheme);

  return (
    <main
      className="min-h-dvh px-6 py-10"
      style={{ ...themeVars(theme), background: "var(--hearth-bg)", color: "var(--hearth-text)" }}
    >
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between">
          <div>
            <h1
              className="text-3xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--hearth-font-display)" }}
            >
              Hey, {user.displayName}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--hearth-text-muted)" }}>
              {user.role === "OPERATOR" ? "Operator" : "Member"} · {user.email}
            </p>
          </div>
          <LogoutButton />
        </header>

        <section
          className="mt-8 rounded-xl border p-5"
          style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}
        >
          <h2 className="text-lg font-semibold">Theme</h2>
          <p className="mb-4 mt-1 text-sm" style={{ color: "var(--hearth-text-muted)" }}>
            Picks apply to your pages immediately. Boards get their own themes when the
            editor arrives.
          </p>
          <ThemePicker themes={THEMES} current={theme.id} />
        </section>

        <section
          className="mt-6 rounded-xl border p-5"
          style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}
        >
          <h2 className="text-lg font-semibold">Coming next</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--hearth-text-muted)" }}>
            The board editor (drag widgets, pick a theme per board) is the next build.
            Meanwhile: <Link href="/status" className="underline" style={{ color: "var(--hearth-accent-2)" }}>system status</Link>{" "}
            · <Link href="/themes" className="underline" style={{ color: "var(--hearth-accent-2)" }}>theme swatches</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
