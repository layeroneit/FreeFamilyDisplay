"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProfileEditor({ currentName }: { currentName: string }) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = name.trim() !== currentName && name.trim().length > 0;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() }),
      });
      if (res.ok) {
        setMsg({ ok: true, text: "Saved." });
        router.refresh();
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({ ok: false, text: body?.error ?? "Couldn't save. Try again." });
      }
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="flex min-w-56 flex-1 flex-col gap-1.5">
        <span className="text-sm" style={{ color: "var(--hearth-text-muted)" }}>
          Display name — how greetings and boards address you
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className="rounded-lg border px-3.5 py-2 text-base outline-none focus:ring-2"
          style={{
            background: "var(--hearth-bg)",
            borderColor: "var(--hearth-border)",
            color: "var(--hearth-text)",
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => void save()}
        disabled={!dirty || busy}
        className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        style={{ background: "var(--hearth-accent-1)", color: "#1a1a1a" }}
      >
        {busy ? "Saving…" : "Save"}
      </button>
      <p aria-live="polite" className="w-full min-h-5 text-sm" style={{ color: msg?.ok ? "var(--hearth-accent-3)" : "var(--hearth-accent-4)" }}>
        {msg?.text}
      </p>
    </div>
  );
}
