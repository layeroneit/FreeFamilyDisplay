"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const inputStyle = {
  background: "var(--hearth-surface)",
  borderColor: "var(--hearth-border)",
  color: "var(--hearth-text)",
} as const;

export function ClaimForm({ minLength }: { minLength: number }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const short = password.length > 0 && password.length < minLength;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const displayName = String(form.get("displayName") ?? "").trim();
    const emailValue = String(form.get("email") ?? "").trim();
    const passwordValue = String(form.get("password") ?? "");

    // Checked here, not left to the browser: the form is `noValidate` so the
    // messages stay ours and themed. Sending these anyway would spend a token
    // from the server's rate limiter on a typo, and the owner fumbling their
    // own setup form is exactly the person who must not be locked out of it.
    const complaint =
      displayName === "" ? "Add your name so the display knows who you are."
      : !/^[^\s@]+@[^\s@]+$/.test(emailValue) ? "That doesn't look like an email address. It's only a username here, but it needs the @."
      : passwordValue.length < minLength ? `Use at least ${minLength} characters.`
      : null;
    if (complaint !== null) {
      setError(complaint);
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, email: emailValue, password: passwordValue }),
      });
      if (res.ok) {
        const ok = (await res.json().catch(() => null)) as { signedIn?: boolean } | null;
        // The account exists either way. `signedIn: false` means only the
        // session cookie failed, so send them to sign in rather than telling
        // them the claim failed - the form would then answer "this display
        // already has an account", which is true and sounds like a rejection.
        router.push(ok?.signedIn === false ? "/login" : "/dashboard");
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
          Your name
        </span>
        <input
          name="displayName"
          type="text"
          autoComplete="name"
          maxLength={80}
          required
          autoFocus
          className="rounded-lg border px-3.5 py-2.5 text-base outline-none focus:ring-2"
          style={inputStyle}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" style={{ color: "var(--hearth-text)" }}>
          Email
        </span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={320}
          required
          className="rounded-lg border px-3.5 py-2.5 text-base outline-none focus:ring-2"
          style={inputStyle}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" style={{ color: "var(--hearth-text)" }}>
          Password
        </span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          maxLength={128}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border px-3.5 py-2.5 text-base outline-none focus:ring-2"
          style={inputStyle}
        />
        {/* Honest about the threat model. This password stops the neighbour
            kid on the wifi and anyone who wanders past an unlocked laptop. It
            is not protecting a bank, and pretending otherwise is how people
            end up with "Passw0rd!" instead of a memorable phrase. */}
        <span className="text-xs leading-relaxed" style={{ color: short ? "var(--hearth-accent-4)" : "var(--hearth-text-muted)" }}>
          {short
            ? `${minLength - password.length} more character${minLength - password.length === 1 ? "" : "s"} to go.`
            : `At least ${minLength} characters — a short sentence works well. This guards a box on your own network, not a bank account, so pick something you'll actually remember: there is no reset email.`}
        </span>
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
        {busy ? "Creating your account…" : "Create my account"}
      </button>
    </form>
  );
}
