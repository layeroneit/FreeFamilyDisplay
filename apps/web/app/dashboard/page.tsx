import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/sessions";
import { termsCurrent } from "@/lib/terms";
import { THEMES, themeById } from "@/lib/themes";
import { ThemePicker } from "./theme-picker";
import { LogoutButton } from "./logout-button";
import { ProfileEditor } from "./profile-editor";
import Link from "next/link";
import { listBoards } from "@/lib/board/boards";

export const metadata = { title: "Dashboard — Free Family Display" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!termsCurrent(user)) redirect("/terms");

  // Theme tokens come from the root layout now — this page just renders.
  const theme = themeById(user.uiTheme);
  const boards = await listBoards(user.id);

  return (
    <main className="min-h-dvh px-6 py-10">
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
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your displays</h2>
            <Link href="/setup" className="rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ background: "var(--hearth-accent-1)", color: "#1a1a1a" }}>
              + Set up a display
            </Link>
          </div>
          {boards.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "var(--hearth-text-muted)" }}>
              No displays yet. Pick a theme below or hit “Set up a display” — three quick steps and it’s on screen.
            </p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {boards.map((b) => (
                <li key={b.id}>
                  <Link href={`/boards/${b.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:opacity-90" style={{ borderColor: "var(--hearth-border)", background: "var(--hearth-bg)" }}>
                    <span>
                      <span className="block font-semibold">{b.name}</span>
                      <span className="block text-xs" style={{ color: "var(--hearth-text-muted)" }}>{b.widgetCount} widgets · {themeById(b.theme).name}</span>
                    </span>
                    <span className="text-sm" style={{ color: "var(--hearth-accent-2)" }}>Edit →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="mt-6 rounded-xl border p-5"
          style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}
        >
          <h2 className="text-lg font-semibold">Profile</h2>
          <ProfileEditor currentName={user.displayName} />
        </section>

        <section
          className="mt-8 rounded-xl border p-5"
          style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}
        >
          <h2 className="text-lg font-semibold">Start with a look</h2>
          <p className="mb-4 mt-1 text-sm" style={{ color: "var(--hearth-text-muted)" }}>
            Pick a theme: it applies to your pages right away and opens the widget picker
            for a new display in that look. Each display keeps its own theme.
          </p>
          <ThemePicker themes={THEMES} current={theme.id} />
        </section>

        <section
          className="mt-6 rounded-xl border p-5"
          style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}
        >
          <h2 className="text-lg font-semibold">More</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--hearth-text-muted)" }}> <Link href="/status" className="underline" style={{ color: "var(--hearth-accent-2)" }}>system status</Link>{" "}
            · <Link href="/themes" className="underline" style={{ color: "var(--hearth-accent-2)" }}>theme swatches</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
