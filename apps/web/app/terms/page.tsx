import { getSessionUser } from "@/lib/auth/sessions";
import { TERMS_SECTIONS, TERMS_VERSION } from "@/lib/terms";
import { AcceptTerms } from "./accept";

export const metadata = { title: "Agreement — Free Family Display" };
export const dynamic = "force-dynamic";

/**
 * End-user agreement gate. Every authenticated surface redirects here until
 * the current version is accepted. Also readable when signed out (linked from
 * the login page) so nobody has to create an account to see the terms.
 */
export default async function TermsPage() {
  const user = await getSessionUser();
  const accepted = user?.termsAcceptedVersion === TERMS_VERSION;

  return (
    <main className="min-h-dvh px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--hearth-accent-2)" }}>
          Free Family Display · Always free
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight" style={{ fontFamily: "var(--hearth-font-display)" }}>
          Before you use this
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--hearth-text-muted)" }}>
          Version {TERMS_VERSION}. Two minutes to read; it matters.
        </p>

        <div className="mt-6 space-y-5 rounded-xl border p-6" style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}>
          {TERMS_SECTIONS.map((s) => (
            <section key={s.heading}>
              <h2 className="font-semibold">{s.heading}</h2>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--hearth-text-muted)" }}>
                {s.body}
              </p>
            </section>
          ))}
        </div>

        {user ? (
          accepted ? (
            <p className="mt-6 text-sm" style={{ color: "var(--hearth-text-muted)" }}>
              You accepted this version on {user.termsAcceptedAt?.toLocaleDateString("en-US", { dateStyle: "long" })}.{" "}
              <a href="/dashboard" className="underline" style={{ color: "var(--hearth-accent-2)" }}>
                Back to your dashboard
              </a>
            </p>
          ) : (
            <AcceptTerms version={TERMS_VERSION} />
          )
        ) : (
          <p className="mt-6 text-sm" style={{ color: "var(--hearth-text-muted)" }}>
            <a href="/login" className="underline" style={{ color: "var(--hearth-accent-2)" }}>
              Sign in
            </a>{" "}
            to accept and continue.
          </p>
        )}
      </div>
    </main>
  );
}

