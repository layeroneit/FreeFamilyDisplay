/**
 * Login — built from docs/design/login-brief.md (commit 125faf0).
 *
 * Split screen: warm family photography on the left (self-hosted, credited,
 * rotating), the form on the right. Password field per ADR 0003; the 1b
 * magic-link flow replaces it later without touching the layout.
 *
 * Photos are OPTIONAL by design: `scripts/fetch-login-photos.mjs` populates
 * public/login-photos/ + credits.json on the box. When absent (fresh clone,
 * CI), the panel renders a hearth-token gradient instead — the page never
 * depends on binaries that live outside git.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/sessions";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — FreeFamilyDisplay" };
export const dynamic = "force-dynamic";

type Credit = { file: string; photographer: string; source: string };

function loadPhotos(): Credit[] {
  try {
    const dir = path.join(process.cwd(), "public", "login-photos");
    const creditsPath = path.join(dir, "credits.json");
    if (!existsSync(creditsPath)) return [];
    const credits = JSON.parse(readFileSync(creditsPath, "utf8")) as Credit[];
    return credits.filter((c) => existsSync(path.join(dir, c.file)));
  } catch {
    return [];
  }
}

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const photos = loadPhotos();
  // Server-side daily rotation: same photo all day, new one tomorrow. No
  // client animation loop — kiosk-adjacent surfaces stay still (§7.8 ethos).
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const photo = photos.length > 0 ? photos[dayIndex % photos.length] : undefined;

  return (
    <main className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      {/* Photo / gradient panel */}
      <div className="relative hidden overflow-hidden lg:block" aria-hidden="true">
        {photo ? (
          <>
            {/* Plain img on purpose: self-hosted, pre-sized by the fetch script — next/image adds nothing here. */}
            <img
              src={`/login-photos/${photo.file}`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Scrim keeps the credit legible on any photo */}
            <div
              className="absolute inset-x-0 bottom-0 h-24"
              style={{ background: "linear-gradient(transparent, rgb(0 0 0 / 0.55))" }}
            />
            <p className="absolute bottom-3 left-4 text-xs text-white/80">
              Photo: {photo.photographer} · {photo.source}
            </p>
          </>
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, var(--hearth-bg), var(--hearth-surface) 55%, var(--hearth-accent-2))",
              opacity: 0.9,
            }}
          />
        )}
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h1
            className="text-4xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--hearth-font-display)", color: "var(--hearth-text)" }}
          >
            Welcome home
          </h1>
          <p className="mt-2 text-base" style={{ color: "var(--hearth-text-muted)" }}>
            Finally, a free family calendar that is customizable and easy to use.
          </p>
          <LoginForm />
          <p className="mt-6 text-xs" style={{ color: "var(--hearth-text-muted)" }}>
            Accounts are invite-only. Ask the person who runs this display.
          </p>
        </div>
      </div>
    </main>
  );
}
