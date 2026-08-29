"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        }),
      });
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Something went wrong. Try again.");
    } catch {
      setError("Couldn't reach the server. Check the network and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" style={{ color: "var(--hearth-text)" }}>
          Email
        </span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          className="rounded-lg border px-3.5 py-2.5 text-base outline-none focus:ring-2"
          style={{
            background: "var(--hearth-surface)",
            borderColor: "var(--hearth-border)",
            color: "var(--hearth-text)",
          }}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" style={{ color: "var(--hearth-text)" }}>
          Password
        </span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border px-3.5 py-2.5 text-base outline-none focus:ring-2"
          style={{
            background: "var(--hearth-surface)",
            borderColor: "var(--hearth-border)",
            color: "var(--hearth-text)",
          }}
        />
      </label>

      {/* aria-live so screen readers hear failures without a focus jump */}
      <p aria-live="polite" role="status" className="min-h-5 text-sm" style={{ color: "var(--hearth-accent-4)" }}>
        {error}
      </p>

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg px-4 py-2.5 text-base font-semibold transition-opacity disabled:opacity-60"
        style={{ background: "var(--hearth-accent-1)", color: "#1a1a1a" }}
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
