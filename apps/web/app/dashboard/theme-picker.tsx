"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ThemeDef } from "@/lib/themes";

export function ThemePicker({ themes, current }: { themes: ThemeDef[]; current: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(id: string) {
    setSaving(id);
    setError(null);
    try {
      const res = await fetch("/api/me/theme", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: id }),
      });
      if (!res.ok) {
        setError("Couldn't save that theme. Try again.");
        return;
      }
      router.refresh(); // server layout re-renders with the new tokens
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {themes.map((t) => {
          const active = t.id === current;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => void choose(t.id)}
              disabled={saving !== null}
              aria-pressed={active}
              className="rounded-lg border p-2 text-left transition-transform hover:scale-[1.02] disabled:opacity-60"
              style={{
                background: t.bg,
                borderColor: active ? "var(--hearth-accent-1)" : t.border,
                borderWidth: active ? 2 : 1,
              }}
            >
              <span className="block rounded-md p-2" style={{ background: t.surface }}>
                <span className="block text-xs font-semibold" style={{ color: t.text }}>
                  {t.name}
                </span>
                <span className="mt-1.5 flex gap-1">
                  {t.accents.map((a) => (
                    <span key={a} className="h-3 w-3 rounded-full" style={{ background: a }} />
                  ))}
                </span>
              </span>
              <span className="mt-1 block text-center text-[10px]" style={{ color: t.muted }}>
                {saving === t.id ? "Saving…" : active ? "Current" : " "}
              </span>
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm" style={{ color: "var(--hearth-accent-4)" }}>
        {error}
      </p>
    </div>
  );
}
