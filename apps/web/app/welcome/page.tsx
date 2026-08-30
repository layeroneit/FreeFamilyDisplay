/**
 * First-run wizard (ADR 0004). Lives at /welcome rather than /setup because
 * /setup is already the board wizard ("set up a display"), and the two would
 * collide both in the route table and in the operator's head.
 *
 * This page exists only while the database has zero accounts. The instant one
 * exists it must be indistinguishable from a route that was never built — so
 * it returns notFound() rather than redirecting, which would confirm to a
 * visitor that the page is real and merely closed.
 */

import { notFound, redirect } from "next/navigation";
import { instanceClaimed } from "@/lib/auth/bootstrap";
import { getSessionUser } from "@/lib/auth/sessions";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { ClaimForm } from "./claim-form";

export const metadata = { title: "Welcome — Free Family Display" };
export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  // Order matters: a signed-in visitor on a claimed instance should land on
  // their dashboard, not a 404.
  if (await getSessionUser()) redirect("/dashboard");
  if (await instanceClaimed()) notFound();

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <p
          className="text-sm font-semibold uppercase tracking-widest"
          style={{ color: "var(--hearth-accent-2)" }}
        >
          Free Family Display <span style={{ color: "var(--hearth-text-muted)" }}>· Always free</span>
        </p>
        <h1
          className="mt-2 text-4xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--hearth-font-display)", color: "var(--hearth-text)" }}
        >
          This one is yours
        </h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--hearth-text-muted)" }}>
          Nobody has claimed this display yet. Make the first account and it
          becomes yours — it runs on your machine, and this page disappears for
          good once you&apos;re done.
        </p>

        <ClaimForm minLength={PASSWORD_MIN_LENGTH} />

        <p className="mt-6 text-xs leading-relaxed" style={{ color: "var(--hearth-text-muted)" }}>
          Your email is just the name you sign in with — nothing is sent to it,
          and this software has no way to send mail at all. By creating an
          account you accept the{" "}
          <a href="/terms" className="underline" style={{ color: "var(--hearth-accent-2)" }}>
            agreement
          </a>{" "}
          (as is, no warranty, use at your own risk), which you&apos;ll be asked
          to read next.
        </p>
      </div>
    </main>
  );
}
