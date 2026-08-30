/**
 * Login — built from docs/design/login-brief.md (commit 125faf0).
 *
 * Split screen: warm family photography on the left (self-hosted, credited,
 * rotating), the form on the right. Password field per ADR 0003 — and per
 * ADR 0004 it is now the only sign-in there is, since a freeware instance on
 * a family LAN has no mail server to send anybody a link.
 *
 * Photos are OPTIONAL by design: `scripts/fetch-login-photos.mjs` populates
 * public/login-photos/ + credits.json on the box. When absent (fresh clone,
 * CI), the panel renders a hearth-token gradient instead — the page never
 * depends on binaries that live outside git.
 */

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/sessions";
import { instanceClaimed } from "@/lib/auth/bootstrap";
import { LoginForm } from "./login-form";
import { PhotoSlideshow, type SlidePhoto } from "./photo-slideshow";
import { largestSrc, loginPhotoSet, srcSet } from "@/lib/board/photo-set";

export const metadata = { title: "Sign in — Free Family Display" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  // A freshly installed instance has no account to sign in to, and a stranger
  // staring at a login form is stuck with no next move. Hand them the one-time
  // bootstrap form instead (ADR 0004).
  if (!(await instanceClaimed())) redirect("/welcome");

  const photos: SlidePhoto[] = loginPhotoSet().map((p) => ({
    src: largestSrc(p),
    srcSet: srcSet(p),
    photographer: p.photographer,
    source: p.source,
    sourceUrl: p.sourceUrl ?? "",
    license: p.license,
    lowRes: p.lowRes,
    nativeW: Math.max(...p.sizes.map((s) => s.w)),
  }));
  // Daily-rotating start index so the first frame varies; the client then
  // crossfades through the set (operator request: slideshow, not static).
  const dayIndex = Math.floor(Date.now() / 86_400_000);

  return (
    <main className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      {/* Photo / gradient panel. Not aria-hidden: the photo credit inside it is
          a license obligation and must reach assistive tech; the images
          themselves carry empty alt text. */}
      <div className="relative hidden overflow-hidden lg:block">
        {photos.length > 0 ? (
          <PhotoSlideshow photos={photos} startIndex={dayIndex} />
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
      <div className="flex flex-col px-6 py-12">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
          <p
            className="text-sm font-semibold uppercase tracking-widest"
            style={{ color: "var(--hearth-accent-2)" }}
          >Free Family Display <span style={{ color: "var(--hearth-text-muted)" }}>· Always free</span></p>
          {/* "Welcome back" over the brief's "Welcome home" — operator feedback
              2026-08-29: "home" read strangely on a sign-in screen. */}
          <h1
            className="mt-2 text-4xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--hearth-font-display)", color: "var(--hearth-text)" }}
          >
            Welcome back
          </h1>
          <p className="mt-2 text-base" style={{ color: "var(--hearth-text-muted)" }}>
            Finally, a free family calendar that is customizable and easy to use.
          </p>
          <LoginForm />
          <p className="mt-6 text-xs" style={{ color: "var(--hearth-text-muted)" }}>
            Accounts are made by the person who set this display up — ask them. By signing in you accept the{" "}
            <a href="/terms" className="underline" style={{ color: "var(--hearth-accent-2)" }}>
              agreement
            </a>{" "}
            (as is, no warranty, use at your own risk).
          </p>

          </div>
        </div>

        {/*
          Built-by credit, pinned to the bottom of the screen (operator request).
          The mark is the real Layer One asset from layeroneconsultants.com, not
          a redrawn approximation. It is painted through a CSS mask with
          --hearth-logo-ink instead of being dropped in as a coloured image:
          the artwork is a monochrome outline supplied in near-white, and four
          of the ten palettes are light, so a plain <img> would be invisible on
          Spring, Summer, Kraft and Nordic. The mask keeps it neutral - it is
          Layer One's mark, not part of this app's palette - while guaranteeing
          it is legible on every theme.
        */}
        <footer className="mt-10 border-t pt-5 text-center" style={{ borderColor: "var(--hearth-border)" }}>
          <a
            href="https://layeroneconsultants.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg px-2 py-1 transition-opacity hover:opacity-80"
          >
            <span
              role="img"
              aria-label="Layer One IT Consultants"
              style={{
                display: "block",
                width: 240,
                height: 18,
                backgroundColor: "var(--hearth-logo-ink)",
                WebkitMaskImage: "url(/brand/layer-one.png)",
                maskImage: "url(/brand/layer-one.png)",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
                WebkitMaskSize: "contain",
                maskSize: "contain",
              }}
            />
          </a>
          <p className="mt-3 text-[11px]" style={{ color: "var(--hearth-text-muted)" }}>
            Free Family Display &copy; 2026 Layer One IT Consultants
          </p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--hearth-text-muted)" }}>
            Free software, provided as is and without warranty of any kind.{" "}
            <a href="/terms" className="underline" style={{ color: "var(--hearth-accent-2)" }}>
              Read the agreement
            </a>
            .
          </p>
        </footer>
      </div>
    </main>
  );
}
