"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BoardCanvas } from "@/components/board/canvas";
import { WidgetFrame } from "@/components/board/widget-frame";
import type { BoardWidgetRow } from "@/lib/board/boards";
import {
  CANVAS_H,
  CANVAS_W,
  GRID,
  WIDGET_META,
  WIDGET_TYPES,
  normalizeGeometry,
  safeWidgetConfig,
  type WidgetType,
} from "@/lib/board/widgets";
import { themeById, themeVars, type ThemeDef } from "@/lib/themes";

const PLAIN = new Set<WidgetType>(["greeting", "clock", "date"]);

/**
 * Board editor: drag to move, corner handle to resize, sidebar for settings.
 * Geometry lives in canvas pixels; pointer deltas are divided by the current
 * scale so a drag on a phone and on a monitor both mean the same thing.
 */
export function BoardEditor({
  board,
  widgets: initial,
  slots,
  themes,
}: {
  board: { id: string; name: string; theme: string };
  widgets: BoardWidgetRow[];
  slots: Record<string, ReactNode>;
  themes: ThemeDef[];
}) {
  const router = useRouter();
  const [widgets, setWidgets] = useState<BoardWidgetRow[]>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState(board.name);
  const [theme, setTheme] = useState(board.theme);
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => setWidgets(initial), [initial]);

  const api = useCallback(async (path: string, init: RequestInit): Promise<boolean> => {
    const res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    }).catch(() => null);
    if (!res || !res.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setMsg(body?.error ?? "Couldn't save that. Try again.");
      return false;
    }
    return true;
  }, []);

  function currentScale(): number {
    const el = canvasRef.current?.querySelector<HTMLElement>("[data-canvas]");
    if (!el) return 1;
    const m = /scale\(([\d.]+)\)/.exec(el.style.transform);
    return m ? Number(m[1]) || 1 : 1;
  }

  function startDrag(e: React.PointerEvent, id: string, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    setSelected(id);
    const target = widgets.find((w) => w.id === id);
    if (!target) return;
    const scale = currentScale();
    const sx = e.clientX;
    const sy = e.clientY;
    const start = { x: target.x, y: target.y, w: target.w, h: target.h, z: target.z };
    let latest: BoardWidgetRow = target;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / scale;
      const dy = (ev.clientY - sy) / scale;
      const g =
        mode === "move"
          ? { ...start, x: start.x + dx, y: start.y + dy }
          : { ...start, w: start.w + dx, h: start.h + dy };
      latest = { ...target, ...normalizeGeometry(target.type, g) };
      setWidgets((ws) => ws.map((w) => (w.id === id ? latest : w)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const { x, y, w, h, z } = latest;
      void api(`/api/boards/${board.id}/widgets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ geometry: { x, y, w, h, z } }),
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function saveConfig(id: string, config: unknown) {
    setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, config } : w)));
    if (await api(`/api/boards/${board.id}/widgets/${id}`, { method: "PATCH", body: JSON.stringify({ config }) })) {
      setMsg("Saved.");
      router.refresh(); // server re-renders the widget content with the new config
    }
  }

  async function remove(id: string) {
    if (await api(`/api/boards/${board.id}/widgets/${id}`, { method: "DELETE" })) {
      setWidgets((ws) => ws.filter((w) => w.id !== id));
      setSelected(null);
      router.refresh();
    }
  }

  async function add(type: WidgetType) {
    setAdding(false);
    if (await api(`/api/boards/${board.id}/widgets`, { method: "POST", body: JSON.stringify({ type }) })) {
      router.refresh();
    }
  }

  async function saveBoard(patch: { name?: string; theme?: string }) {
    if (await api(`/api/boards/${board.id}`, { method: "PATCH", body: JSON.stringify(patch) })) {
      setMsg("Saved.");
      router.refresh();
    }
  }

  const sel = widgets.find((w) => w.id === selected) ?? null;
  const vars = themeVars(themeById(theme));
  const field = { background: "var(--hearth-surface)", borderColor: "var(--hearth-border)", color: "var(--hearth-text)" };

  return (
    <main className="min-h-dvh px-4 py-6 lg:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm underline" style={{ color: "var(--hearth-text-muted)" }}>
              ← Dashboard
            </Link>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() && name.trim() !== board.name) void saveBoard({ name: name.trim() });
              }}
              maxLength={80}
              className="rounded-lg border bg-transparent px-3 py-1.5 text-lg font-semibold"
              style={{ borderColor: "var(--hearth-border)" }}
              aria-label="Display name"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label style={{ color: "var(--hearth-text-muted)" }}>Theme</label>
            <select
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value);
                void saveBoard({ theme: e.target.value });
              }}
              className="rounded-lg border px-2 py-1.5"
              style={field}
            >
              {themes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setAdding((a) => !a)}
              className="rounded-lg px-3 py-1.5 font-semibold"
              style={{ background: "var(--hearth-accent-1)", color: "#1a1a1a" }}
            >
              + Add widget
            </button>
            <Link href={`/boards/${board.id}/view`} className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--hearth-border)" }}>
              Full screen ↗
            </Link>
          </div>
        </header>

        {adding && (
          <div
            className="mb-4 grid grid-cols-2 gap-2 rounded-xl border p-3 sm:grid-cols-4"
            style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}
          >
            {WIDGET_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => void add(t)}
                className="rounded-lg border p-3 text-left text-sm hover:opacity-90"
                style={{ borderColor: "var(--hearth-border)", background: "var(--hearth-bg)" }}
              >
                <span className="block font-semibold">{WIDGET_META[t].label}</span>
                <span className="block text-xs" style={{ color: "var(--hearth-text-muted)" }}>
                  {WIDGET_META[t].description}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
          <div
            ref={canvasRef}
            className="rounded-xl border"
            style={{ borderColor: "var(--hearth-border)" }}
            onPointerDown={() => setSelected(null)}
          >
            <BoardCanvas vars={vars}>
              {widgets.map((w) => (
                <div key={w.id}>
                  <div
                    onPointerDown={(e) => startDrag(e, w.id, "move")}
                    style={{ position: "absolute", left: 0, top: 0, cursor: "move" }}
                  >
                    <WidgetFrame type={w.type} x={w.x} y={w.y} w={w.w} h={w.h} z={w.z} plain={PLAIN.has(w.type)}>
                      <div style={{ pointerEvents: "none", height: "100%", position: "relative" }}>{slots[w.id]}</div>
                    </WidgetFrame>
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      left: w.x,
                      top: w.y,
                      width: w.w,
                      height: w.h,
                      zIndex: 1000 + w.z,
                      outline: selected === w.id ? "3px solid var(--hearth-accent-1)" : "1px dashed rgb(128 128 128 / 0.35)",
                      borderRadius: 14,
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, w.id, "resize")}
                    title="Resize"
                    style={{
                      position: "absolute",
                      left: w.x + w.w - 28,
                      top: w.y + w.h - 28,
                      width: 28,
                      height: 28,
                      zIndex: 1001 + w.z,
                      cursor: "nwse-resize",
                      background: "var(--hearth-accent-1)",
                      borderRadius: 6,
                      opacity: selected === w.id ? 1 : 0.35,
                    }}
                  />
                </div>
              ))}
            </BoardCanvas>
          </div>

          <aside
            className="rounded-xl border p-4 text-sm"
            style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}
          >
            {sel ? (
              <WidgetSettings
                key={sel.id}
                widget={sel}
                onSave={(c) => void saveConfig(sel.id, c)}
                onRemove={() => void remove(sel.id)}
              />
            ) : (
              <>
                <h2 className="font-semibold">Editing {name}</h2>
                <p className="mt-1" style={{ color: "var(--hearth-text-muted)" }}>
                  Drag a widget to move it. Drag the corner square to resize. Tap one to change its settings.
                  Positions save automatically and snap to a {GRID}px grid on the {CANVAS_W}×{CANVAS_H} canvas.
                </p>
                <ul className="mt-3 space-y-1">
                  {widgets.map((w) => (
                    <li key={w.id}>
                      <button type="button" onClick={() => setSelected(w.id)} className="underline">
                        {WIDGET_META[w.type].label}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p aria-live="polite" className="mt-3 min-h-5 text-xs" style={{ color: "var(--hearth-text-muted)" }}>
              {msg}
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}

function WidgetSettings({
  widget,
  onSave,
  onRemove,
}: {
  widget: BoardWidgetRow;
  onSave: (config: unknown) => void;
  onRemove: () => void;
}) {
  const input = { background: "var(--hearth-bg)", borderColor: "var(--hearth-border)", color: "var(--hearth-text)" };
  const field = "mt-1 w-full rounded-lg border px-3 py-1.5";
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({
    ...(safeWidgetConfig(widget.type, widget.config) as Record<string, unknown>),
  }));
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div>
      <h2 className="font-semibold">{WIDGET_META[widget.type].label}</h2>
      <p className="mt-1 text-xs" style={{ color: "var(--hearth-text-muted)" }}>
        {WIDGET_META[widget.type].description}
      </p>
      <div className="mt-3 space-y-3">
        {widget.type === "greeting" && (
          <label className="block">
            Name to greet
            <input className={field} style={input} value={String(draft["name"] ?? "")} maxLength={40} onChange={(e) => set("name", e.target.value)} />
          </label>
        )}
        {widget.type === "clock" && (
          <>
            <label className="block">
              Format
              <select className={field} style={input} value={String(draft["format"])} onChange={(e) => set("format", e.target.value)}>
                <option value="12h">12-hour</option>
                <option value="24h">24-hour</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={Boolean(draft["showSeconds"])} onChange={(e) => set("showSeconds", e.target.checked)} />
              Show seconds
            </label>
          </>
        )}
        {widget.type === "date" && (
          <label className="block">
            Style
            <select className={field} style={input} value={String(draft["style"])} onChange={(e) => set("style", e.target.value)}>
              <option value="long">Saturday, August 30</option>
              <option value="short">Sat, Aug 30</option>
            </select>
          </label>
        )}
        {widget.type === "weather" && (
          <>
            <label className="block">
              City or town
              <input className={field} style={input} value={String(draft["location"] ?? "")} maxLength={80} onChange={(e) => set("location", e.target.value)} />
            </label>
            <label className="block">
              Units
              <select className={field} style={input} value={String(draft["units"])} onChange={(e) => set("units", e.target.value)}>
                <option value="f">°F</option>
                <option value="c">°C</option>
              </select>
            </label>
          </>
        )}
        {widget.type === "calendar" && (
          <label className="block">
            Days shown
            <input type="number" min={1} max={14} className={field} style={input} value={Number(draft["days"] ?? 7)} onChange={(e) => set("days", Number(e.target.value))} />
          </label>
        )}
        {widget.type === "photos" && (
          <label className="block">
            Seconds per photo
            <input type="number" min={5} max={600} className={field} style={input} value={Number(draft["intervalSec"] ?? 20)} onChange={(e) => set("intervalSec", Number(e.target.value))} />
          </label>
        )}
        {widget.type === "notes" && (
          <label className="block">
            Note
            <textarea className={field} style={input} rows={5} maxLength={2000} value={String(draft["text"] ?? "")} onChange={(e) => set("text", e.target.value)} />
          </label>
        )}
        {widget.type === "quote" && (
          <p style={{ color: "var(--hearth-text-muted)" }}>Nothing to configure — a new line every day.</p>
        )}
      </div>
      <div className="mt-4 flex justify-between">
        <button type="button" onClick={onRemove} className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--hearth-border)", color: "var(--hearth-accent-4)" }}>
          Remove
        </button>
        <button type="button" onClick={() => onSave(draft)} className="rounded-lg px-3 py-1.5 font-semibold" style={{ background: "var(--hearth-accent-1)", color: "#1a1a1a" }}>
          Save
        </button>
      </div>
    </div>
  );
}
