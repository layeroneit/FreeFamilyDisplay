"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AcceptTerms({ version }: { version: string }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/accept-terms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version }),
      });
      if (!res.ok) {
        setError("Couldn't record that. Try again.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border p-5" style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 h-4 w-4" />
        <span className="text-sm">
          I've read this. I understand Free Family Display is provided as is, with no warranty, and that I use it at my own risk.
        </span>
      </label>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm" style={{ color: "var(--hearth-accent-4)" }}>
        {error}
      </p>
      <button
        type="button"
        disabled={!checked || busy}
        onClick={() => void accept()}
        className="mt-2 rounded-lg px-4 py-2.5 text-base font-semibold disabled:opacity-50"
        style={{ background: "var(--hearth-accent-1)", color: "#1a1a1a" }}
      >
        {busy ? "Saving…" : "Accept and continue"}
      </button>
    </div>
  );
}
