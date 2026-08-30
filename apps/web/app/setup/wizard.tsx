"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudSun,
  Images,
  LayoutGrid,
  Palette,
  PenLine,
  Quote,
  Sparkles,
  StickyNote,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { WIDGET_META, WIDGET_TYPES, type WidgetType } from "@/lib/board/widgets";
import { themeVars, type ThemeDef } from "@/lib/themes";

/**
 * Setup wizard — built on the onboarding shape the operator called "golden":
 * a cinematic welcome, one consistent step skeleton (icon → heading → one warm
 * line → content → Back / Continue / Skip), a background that tints itself to
 * the chosen look, swatches with checkmarks instead of dropdowns, a tile grid
 * for choices, and a short activation beat before landing in the editor.
 * Pattern only — no code crosses over from any other product.
 */

const WELCOME = 0;
const LOOK = 1;
const WIDGETS = 2;
const NAME = 3;
const TOTAL = 4;

const WIDGET_ICON: Record<WidgetType, LucideIcon> = {
  greeting: Sun,
  clock: Clock,
  date: CalendarDays,
  weather: CloudSun,
  calendar: CalendarDays,
  photos: Images,
  quote: Quote,
  notes: StickyNote,
};

const ACTIVATION_LINES = [
  "Laying out your canvas…",
  "Tuning the colors…",
  "Asking the sky about the weather…",
  "Hanging it on the wall.",
];

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
  return (parts[0] ?? "?").slice(0, 2).toUpperCase();
}

export function SetupWizard({
  themes,
  initialTheme,
  viewerName,
  startStep,
}: {
  themes: ThemeDef[];
  initialTheme: string;
  viewerName: string;
  startStep: 0 | 2;
}) {
  const router = useRouter();
  const [step, setStep] = useState<number>(startStep);
  const [theme, setTheme] = useState(initialTheme);
  const [picked, setPicked] = useState<Set<WidgetType>>(
    () => new Set(WIDGET_TYPES.filter((t) => WIDGET_META[t].starter)),
  );
  // Display names allow 80 chars; the greeting config allows 40 — prefill
  // within the limit so the default happy path can never 400.
  const [greetingName, setGreetingName] = useState(viewerName.slice(0, 40));
  const [weatherLocation, setWeatherLocation] = useState("");
  const [units, setUnits] = useState<"f" | "c">("f");
  const [name, setName] = useState("Kitchen");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);

  const t = useMemo(() => themes.find((x) => x.id === theme) ?? themes[0], [themes, theme]);
  const accent = t?.accents[0] ?? "#FFD23F";
  const firstName = viewerName.trim().split(/\s+/)[0] ?? viewerName;

  const toggle = useCallback((w: WidgetType) => {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(w)) n.delete(w);
      else n.add(w);
      return n;
    });
  }, []);

  // Activation beat: staggered lines, then land in the editor.
  useEffect(() => {
    if (!activating) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => setLineIndex((i) => Math.min(i + 1, ACTIVATION_LINES.length - 1)), 650);
    return () => clearInterval(id);
  }, [activating]);

  async function create() {
    setBusy(true);
    setErr(null);
    setActivating(true);
    setLineIndex(0);
    const started = Date.now();
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
        setActivating(false);
        setErr(body?.error ?? "Couldn't create the display.");
        return;
      }
      // Let the beat play for at least ~2.4s unless the user prefers less motion.
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const minMs = reduce ? 0 : 2_400;
      const wait = Math.max(0, minMs - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));
      router.push(`/boards/${body.id}`);
    } catch {
      setActivating(false);
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setErr(null);
    if (step === NAME) {
      if (name.trim().length === 0) {
        setErr("Give the display a name — where will it live?");
        return;
      }
      void create();
      return;
    }
    if (step === WIDGETS && picked.size === 0) {
      setErr("Pick at least one thing to show.");
      return;
    }
    setStep((s) => Math.min(s + 1, NAME));
  }

  function back() {
    setErr(null);
    setStep((s) => Math.max(s - 1, WELCOME));
  }

  const progress = ((step + 1) / TOTAL) * 100;
  const vars = t ? themeVars(t) : {};
  const outerStyle = {
    ...vars,
    background: `linear-gradient(180deg, var(--hearth-bg) 0%, color-mix(in srgb, ${accent} 14%, var(--hearth-bg)) 100%)`,
    color: "var(--hearth-text)",
  } as React.CSSProperties;

  const chrome = {
    heading: "text-2xl font-semibold tracking-tight sm:text-3xl",
    muted: "text-base sm:text-lg",
    input:
      "min-h-12 w-full rounded-2xl border px-4 text-base outline-none focus:ring-2 sm:text-lg",
    tile: "flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-all active:scale-[0.98]",
  };
  const inputStyle = { background: "var(--hearth-surface)", borderColor: "var(--hearth-border)", color: "var(--hearth-text)" };

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-8" style={outerStyle}>
      {activating ? (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
          style={{ background: "var(--hearth-bg)" }}
          role="status"
          aria-live="polite"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70 blur-3xl"
            style={{ background: `radial-gradient(ellipse 60% 40% at 50% 30%, color-mix(in srgb, ${accent} 35%, transparent), transparent 70%)` }}
            aria-hidden
          />
          <div className="relative w-full max-w-md border-l-[3px] pl-6" style={{ borderColor: accent }}>
            {ACTIVATION_LINES.slice(0, lineIndex + 1).map((line, i) => (
              <p
                key={line}
                className="py-1.5 text-lg font-medium sm:text-xl"
                style={{ color: i === lineIndex ? "var(--hearth-text)" : "var(--hearth-text-muted)" }}
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {step === WELCOME ? (
        <div className="flex w-full max-w-lg flex-col items-center px-2 py-10 text-center">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.35em]" style={{ color: "var(--hearth-text-muted)" }}>
            Welcome
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ fontFamily: "var(--hearth-font-display)" }}>
            This is your display, {firstName}
          </h1>

          <div className="relative my-10">
            <div
              className="pointer-events-none absolute inset-[-18px] rounded-full opacity-70 blur-2xl motion-safe:animate-pulse"
              style={{ background: `radial-gradient(circle, color-mix(in srgb, ${accent} 55%, transparent) 0%, transparent 70%)` }}
              aria-hidden
            />
            <div
              className="relative flex size-40 items-center justify-center rounded-full border-2 text-4xl font-bold"
              style={{ borderColor: "var(--hearth-border)", background: "var(--hearth-surface)", color: accent }}
            >
              {initialsFrom(viewerName)}
            </div>
          </div>

          <p className={cn("max-w-md leading-relaxed", chrome.muted)} style={{ color: "var(--hearth-text-muted)" }}>
            A screen on the wall with your week, the weather, your photos, and a note for the
            house. Three quick taps and it&apos;s up.
          </p>

          <button
            type="button"
            className="mt-10 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold shadow-lg transition-all active:scale-[0.98]"
            style={{ background: accent, color: "#1a1a1a" }}
            onClick={next}
          >
            Set up my display
            <ChevronRight className="size-5" />
          </button>
          <p className="mt-6 text-[11px] uppercase tracking-widest" style={{ color: "var(--hearth-text-muted)" }}>
            Step 1 of {TOTAL}
          </p>
        </div>
      ) : (
        <div className={cn("w-full space-y-6", step === WIDGETS ? "max-w-md sm:max-w-2xl" : "max-w-md sm:max-w-lg")}>
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: accent }}>
              FreeFamilyDisplay
            </p>
            <div className="mx-auto mt-3 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--hearth-border)" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: accent }} />
            </div>
            <p className="mt-2 text-[10px] uppercase tracking-widest" style={{ color: "var(--hearth-text-muted)" }}>
              Step {step + 1} of {TOTAL}
            </p>
          </div>

          {err ? (
            <div
              className="rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: "var(--hearth-accent-4)", color: "var(--hearth-accent-4)", background: "color-mix(in srgb, var(--hearth-accent-4) 10%, transparent)" }}
              role="alert"
            >
              {err}
            </div>
          ) : null}

          {step === LOOK ? (
            <div className="space-y-5">
              <div className="text-center">
                <Palette className="mx-auto size-10" style={{ color: accent }} />
                <h2 className={cn("mt-2", chrome.heading)}>Pick a look</h2>
                <p className={cn("mt-1", chrome.muted)} style={{ color: "var(--hearth-text-muted)" }}>
                  Every widget adapts to it. Change it whenever you like.
                </p>
              </div>
              <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {themes.map((th) => {
                  const selected = th.id === theme;
                  return (
                    <button
                      key={th.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setTheme(th.id)}
                      className="flex flex-col items-center gap-2 rounded-2xl border p-2.5 transition-all active:scale-[0.97]"
                      style={{
                        borderColor: selected ? th.accents[0] : "var(--hearth-border)",
                        boxShadow: selected ? `0 0 0 2px ${th.accents[0]}` : undefined,
                        background: "var(--hearth-surface)",
                      }}
                    >
                      <span className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl" style={{ background: th.bg }} aria-hidden>
                        {th.accents.map((a) => (
                          <span key={a} className="size-3.5 rounded-full" style={{ background: a }} />
                        ))}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-bold">
                        {selected ? <Check className="size-3.5" style={{ color: th.accents[0] }} /> : null}
                        {th.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-2xl border p-5" style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}>
                <div className="text-2xl font-semibold" style={{ fontFamily: "var(--hearth-font-display)" }}>
                  Good morning, <span style={{ color: accent }}>{firstName}</span>
                </div>
                <div className="mt-1 text-sm" style={{ color: "var(--hearth-text-muted)" }}>
                  Saturday, August 30 · 72° and clear
                </div>
              </div>
            </div>
          ) : null}

          {step === WIDGETS ? (
            <div className="space-y-5">
              <div className="text-center">
                <LayoutGrid className="mx-auto size-10" style={{ color: accent }} />
                <h2 className={cn("mt-2", chrome.heading)}>What goes on it?</h2>
                <p className={cn("mt-1", chrome.muted)} style={{ color: "var(--hearth-text-muted)" }}>
                  The usual suspects are ticked. Tap to toggle; you can rearrange everything after.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {WIDGET_TYPES.map((w) => {
                  const on = picked.has(w);
                  const m = WIDGET_META[w];
                  const Icon = WIDGET_ICON[w];
                  return (
                    <div
                      key={w}
                      className={chrome.tile}
                      style={{
                        background: "var(--hearth-surface)",
                        borderColor: on ? accent : "var(--hearth-border)",
                        boxShadow: on ? `0 0 0 2px ${accent}` : undefined,
                      }}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(w)}
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: `color-mix(in srgb, ${accent} 22%, transparent)`, color: on ? accent : "var(--hearth-text-muted)" }}
                        aria-label={`${on ? "Remove" : "Add"} ${m.label}`}
                      >
                        {on ? <Check className="size-5" /> : <Icon className="size-5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <button type="button" onClick={() => toggle(w)} className="block text-left text-sm font-bold">
                          {m.label}
                        </button>
                        <p className="mt-0.5 text-xs leading-snug" style={{ color: "var(--hearth-text-muted)" }}>
                          {m.description}
                        </p>
                        {w === "greeting" && on ? (
                          <input
                            value={greetingName}
                            onChange={(e) => setGreetingName(e.target.value)}
                            maxLength={40}
                            placeholder="Who to greet"
                            className="mt-2 w-full rounded-xl border px-3 py-1.5 text-sm outline-none focus:ring-2"
                            style={{ ...inputStyle, background: "var(--hearth-bg)" }}
                          />
                        ) : null}
                        {w === "weather" && on ? (
                          <div className="mt-2 flex gap-2">
                            <input
                              value={weatherLocation}
                              onChange={(e) => setWeatherLocation(e.target.value)}
                              maxLength={80}
                              placeholder="City or town, e.g. Chicago"
                              className="w-full rounded-xl border px-3 py-1.5 text-sm outline-none focus:ring-2"
                              style={{ ...inputStyle, background: "var(--hearth-bg)" }}
                            />
                            <select
                              value={units}
                              onChange={(e) => setUnits(e.target.value === "c" ? "c" : "f")}
                              className="rounded-xl border px-2 text-sm"
                              style={{ ...inputStyle, background: "var(--hearth-bg)" }}
                              aria-label="Units"
                            >
                              <option value="f">°F</option>
                              <option value="c">°C</option>
                            </select>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === NAME ? (
            <div className="space-y-5 text-center">
              <PenLine className="mx-auto size-10" style={{ color: accent }} />
              <h2 className={chrome.heading}>Name it</h2>
              <p className={cn("mt-1", chrome.muted)} style={{ color: "var(--hearth-text-muted)" }}>
                Where will this screen live? Kitchen, hallway, the garage…
              </p>
              <input
                className={cn("text-center font-semibold", chrome.input)}
                style={inputStyle}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") next();
                }}
              />
              <p className="text-[11px] uppercase tracking-widest" style={{ color: "var(--hearth-text-muted)" }}>
                {picked.size} widget{picked.size === 1 ? "" : "s"} · {t?.name ?? "Midnight"} look
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
            <button
              type="button"
              className="order-2 flex shrink-0 items-center justify-center gap-1 rounded-2xl border px-4 py-3.5 text-sm font-bold transition-all active:scale-[0.98] sm:order-1 sm:px-5 sm:py-4 sm:text-base"
              style={{ borderColor: "var(--hearth-border)", background: "var(--hearth-surface)" }}
              onClick={back}
              disabled={busy}
            >
              <ChevronLeft className="size-4" />
              Back
            </button>
            <button
              type="button"
              className="order-1 flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3.5 text-base font-bold transition-all active:scale-[0.97] disabled:opacity-40 sm:order-2 sm:py-4 sm:text-lg"
              style={{ background: accent, color: "#1a1a1a" }}
              onClick={next}
              disabled={busy}
            >
              {step === NAME ? (
                <>
                  <Sparkles className="size-4" />
                  {busy ? "Creating…" : "Create my display"}
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="size-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
