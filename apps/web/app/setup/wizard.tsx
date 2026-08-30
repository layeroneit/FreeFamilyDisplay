"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WIDGET_META, WIDGET_TYPES, type WidgetType } from "@/lib/board/widgets";
import { themeVars, type ThemeDef } from "@/lib/themes";

/**
 * Setup wizard — the pattern every family-display product converges on
 * (docs/research): pick a look → add widgets → name it → land in the editor.
 */
export function SetupWizard({
  themes,
  initialTheme,
  viewerName,
  startStep,
}: {
  themes: ThemeDef[];
  initialTheme: string;
  viewerName: string;
  startStep: 1 | 2;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(startStep);
  const [theme, setTheme] = useState(initialTheme);
  const [picked, setPicked] = useState<Set<WidgetType>>(
    () => new Set(WIDGET_TYPES.filter((t) => WIDGET_META[t].starter)),
  );
  const [greetingName, setGreetingName] = useState(viewerName);
  const [weatherLocation, setWeatherLocation] = useState("");
  const [units, setUnits] = useState<"f" | "c">("f");
  const [name, setName] = useState("Kitchen");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = themes.find((x) => x.id === theme) ?? themes[0];

  function toggle(w: WidgetType) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(w)) n.delete(w);
      else n.add(w);
      return n;
    });
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const configs: Partial<Record<WidgetType, unknown>> = {
        greeting: { name: greetingName.trim() },
        weather: { location: weatherLocation.trim() || "Chicago", units },
      };
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), theme, widgets: [...picked], configs }),
      });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !body?.id) {
        setError(body?.error ?? "Couldn't create the display.");
        return;
      }
      router.push(`/boards/${body.id}`);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const input = { background: "var(--hearth-bg)", borderColor: "var(--hearth-border)", color: "var(--hearth-text)" };
  const primary = { background: "var(--hearth-accent-1)", color: "#1a1a1a" };
  const secondary = { borderColor: "var(--hearth-border)" };

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--hearth-accent-2)" }}>
        New display · step {step} of 3
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight" style={{ fontFamily: "var(--hearth-font-display)" }}>
        {step === 1 ? "Pick a look" : step === 2 ? "Choose what's on it" : "Name it"}
      </h1>

      {step === 1 && (
        <>
          <p className="mt-2 text-sm" style={{ color: "var(--hearth-text-muted)" }}>
            You can change this any time. Every widget adapts to the theme.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {themes.map((th) => (
              <button
                key={th.id}
                type="button"
                onClick={() => setTheme(th.id)}
                aria-pressed={th.id === theme}
                className="rounded-lg border p-2 text-left"
                style={{
                  background: th.bg,
                  borderColor: th.id === theme ? "var(--hearth-accent-1)" : th.border,
                  borderWidth: th.id === theme ? 2 : 1,
                }}
              >
                <span className="block rounded-md p-2" style={{ background: th.surface }}>
                  <span className="block text-xs font-semibold" style={{ color: th.text }}>
                    {th.name}
                  </span>
                  <span className="mt-1.5 flex gap-1">
                    {th.accents.map((a) => (
                      <span key={a} className="h-3 w-3 rounded-full" style={{ background: a }} />
                    ))}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {t ? (
            <div
              className="mt-6 rounded-xl border p-5"
              style={{ ...themeVars(t), background: "var(--hearth-bg)", borderColor: "var(--hearth-border)", color: "var(--hearth-text)" }}
            >
              <div className="text-2xl font-semibold" style={{ fontFamily: "var(--hearth-font-display)" }}>
                Good morning, <span style={{ color: "var(--hearth-accent-1)" }}>{viewerName}</span>
              </div>
              <div className="mt-1 text-sm" style={{ color: "var(--hearth-text-muted)" }}>
                Saturday, August 30 · 72° and clear
              </div>
            </div>
          ) : null}
          <div className="mt-6 flex justify-end">
            <button type="button" onClick={() => setStep(2)} className="rounded-lg px-4 py-2 text-sm font-semibold" style={primary}>
              Next: widgets →
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <p className="mt-2 text-sm" style={{ color: "var(--hearth-text-muted)" }}>
            Starter picks are ticked. Untick anything you don't want; you can add more later.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {WIDGET_TYPES.map((w) => {
              const on = picked.has(w);
              const m = WIDGET_META[w];
              return (
                <label
                  key={w}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border p-4"
                  style={{ background: "var(--hearth-surface)", borderColor: on ? "var(--hearth-accent-1)" : "var(--hearth-border)" }}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(w)} className="mt-1 h-4 w-4" />
                  <span className="flex-1">
                    <span className="block font-semibold">{m.label}</span>
                    <span className="block text-sm" style={{ color: "var(--hearth-text-muted)" }}>
                      {m.description}
                    </span>
                    {w === "greeting" && on && (
                      <input
                        value={greetingName}
                        onChange={(e) => setGreetingName(e.target.value)}
                        maxLength={40}
                        placeholder="Who to greet"
                        className="mt-2 w-full rounded-lg border px-3 py-1.5 text-sm"
                        style={input}
                      />
                    )}
                    {w === "weather" && on && (
                      <span className="mt-2 flex gap-2">
                        <input
                          value={weatherLocation}
                          onChange={(e) => setWeatherLocation(e.target.value)}
                          maxLength={80}
                          placeholder="City or town, e.g. Chicago"
                          className="w-full rounded-lg border px-3 py-1.5 text-sm"
                          style={input}
                        />
                        <select
                          value={units}
                          onChange={(e) => setUnits(e.target.value === "c" ? "c" : "f")}
                          className="rounded-lg border px-2 text-sm"
                          style={input}
                        >
                          <option value="f">°F</option>
                          <option value="c">°C</option>
                        </select>
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="mt-6 flex justify-between">
            <button type="button" onClick={() => setStep(1)} className="rounded-lg border px-4 py-2 text-sm" style={secondary}>
              ← Look
            </button>
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => setStep(3)}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={primary}
            >
              Next: name →
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <p className="mt-2 text-sm" style={{ color: "var(--hearth-text-muted)" }}>
            Where will this screen live?
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoFocus
            className="mt-4 w-full max-w-md rounded-lg border px-3.5 py-2.5 text-base"
            style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)", color: "var(--hearth-text)" }}
          />
          <p aria-live="polite" className="mt-2 min-h-5 text-sm" style={{ color: "var(--hearth-accent-4)" }}>
            {error}
          </p>
          <div className="mt-4 flex justify-between">
            <button type="button" onClick={() => setStep(2)} className="rounded-lg border px-4 py-2 text-sm" style={secondary}>
              ← Widgets
            </button>
            <button
              type="button"
              disabled={busy || name.trim().length === 0}
              onClick={() => void create()}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={primary}
            >
              {busy ? "Creating…" : "Create display"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
