"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BoardCanvas } from "@/components/board/canvas";
import { WidgetFrame } from "@/components/board/widget-frame";
import type { BoardWidgetRow } from "@/lib/board/boards";
import type { CollectionInfo } from "@/lib/board/wallpapers";
import {
  CANVAS_PRESETS,
  CANVAS_PRESET_IDS,
  CLOCK_STYLES,
  GRID,
  WIDGET_META,
  WIDGET_TYPES,
  canvasSize,
  normalizeGeometry,
  safeWidgetConfig,
  type CanvasPreset,
  type WidgetType,
} from "@/lib/board/widgets";
import type { ThemeDef } from "@/lib/themes";

type EditorBoard = {
  id: string;
  name: string;
  theme: string;
  canvas: CanvasPreset;
  wallpaperCollectionId: string | null;
  wallpaperRotation: "DAILY" | "WEEKLY" | "MONTHLY" | "MANUAL";
  wallpaperOrder: "SEQUENTIAL" | "SHUFFLE";
  scrimOpacityOverride: number | null;
  matchPaletteToWallpaper: boolean;
  weatherMood: boolean;
  weatherMoodStrength: number;
  pinned: boolean;
};

/**
 * Board editor: drag to move, corner handle to resize, sidebar for settings.
 * Geometry lives in canvas pixels; pointer deltas are divided by the current
 * scale so a drag on a phone and on a monitor both mean the same thing.
 *
 * Pointer handling (audit-hardened): one drag at a time, filtered by
 * pointerId; `pointercancel` and `lostpointercapture` tear down like
 * `pointerup`; `touch-action: none` on the draggable surfaces so the browser
 * never steals the gesture for scrolling; a tap with no movement writes
 * nothing.
 */
export function BoardEditor({
  board,
  widgets: initial,
  slots,
  themes,
  vars,
  hasWallpaper,
  wallpaperCredit,
  suggestedScrim,
  collections,
  moodLabel,
  backdrop,
}: {
  board: EditorBoard;
  widgets: BoardWidgetRow[];
  slots: Record<string, ReactNode>;
  themes: ThemeDef[];
  vars: Record<string, string>;
  hasWallpaper: boolean;
  wallpaperCredit: string | null;
  suggestedScrim: number | null;
  collections: CollectionInfo[];
  moodLabel: string | null;
  backdrop: ReactNode;
}) {
  const router = useRouter();
  const [widgets, setWidgets] = useState<BoardWidgetRow[]>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState(board.name);
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<"widgets" | "display">("widgets");
  const scaleRef = useRef(1);
  const dragRef = useRef<{ pointerId: number } | null>(null);
  const addingRef = useRef(false);
  const size = canvasSize(board.canvas);

  useEffect(() => {
    if (dragRef.current) return;
    setWidgets(initial);
  }, [initial]);

  const api = useCallback(async (path: string, init: RequestInit): Promise<boolean> => {
    const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } }).catch(() => null);
    if (!res || !res.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setMsg(body?.error ?? "Couldn't save that. Try again.");
      return false;
    }
    return true;
  }, []);

  function startDrag(e: React.PointerEvent<HTMLElement>, id: string, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    setSelected(id);
    setTab("widgets");
    if (dragRef.current) return;
    const target = widgets.find((w) => w.id === id);
    if (!target) return;

    const pointerId = e.pointerId;
    dragRef.current = { pointerId };
    const el = e.currentTarget;
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* best-effort */
    }
    const scale = scaleRef.current || 1;
    const sx = e.clientX;
    const sy = e.clientY;
    const start = { x: target.x, y: target.y, w: target.w, h: target.h, z: target.z };
    let latest: BoardWidgetRow = target;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const dx = (ev.clientX - sx) / scale;
      const dy = (ev.clientY - sy) / scale;
      if (!moved && Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      moved = true;
      const g = mode === "move" ? { ...start, x: start.x + dx, y: start.y + dy } : { ...start, w: start.w + dx, h: start.h + dy };
      latest = { ...target, ...normalizeGeometry(target.type, g, board.canvas) };
      setWidgets((ws) => ws.map((w) => (w.id === id ? latest : w)));
    };
    const finish = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      el.removeEventListener("lostpointercapture", finish);
      dragRef.current = null;
      try {
        el.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
      if (!moved) return;
      const { x, y, w, h, z } = latest;
      void api(`/api/boards/${board.id}/widgets/${id}`, { method: "PATCH", body: JSON.stringify({ geometry: { x, y, w, h, z } }) });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    el.addEventListener("lostpointercapture", finish);
  }

  async function saveConfig(id: string, config: unknown) {
    const previous = widgets.find((w) => w.id === id)?.config;
    setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, config } : w)));
    const ok = await api(`/api/boards/${board.id}/widgets/${id}`, { method: "PATCH", body: JSON.stringify({ config }) });
    if (ok) {
      setMsg("Saved.");
      router.refresh();
    } else {
      setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, config: previous } : w)));
    }
    return ok;
  }

  async function remove(id: string) {
    if (await api(`/api/boards/${board.id}/widgets/${id}`, { method: "DELETE" })) {
      setWidgets((ws) => ws.filter((w) => w.id !== id));
      setSelected(null);
      router.refresh();
    }
  }

  async function add(type: WidgetType) {
    if (addingRef.current) return;
    addingRef.current = true;
    setAdding(false);
    try {
      if (await api(`/api/boards/${board.id}/widgets`, { method: "POST", body: JSON.stringify({ type }) })) router.refresh();
    } finally {
      addingRef.current = false;
    }
  }

  async function saveBoard(patch: Record<string, unknown>) {
    if (await api(`/api/boards/${board.id}`, { method: "PATCH", body: JSON.stringify(patch) })) {
      setMsg("Saved.");
      router.refresh();
    }
  }

  async function wallpaperAction(action: "next" | "pin" | "skip") {
    if (await api(`/api/boards/${board.id}/wallpaper`, { method: "POST", body: JSON.stringify({ action }) })) {
      setMsg(action === "pin" ? (board.pinned ? "Unpinned." : "Pinned — this one stays.") : action === "skip" ? "Skipped." : "Next one up.");
      router.refresh();
    }
  }

  const sel = widgets.find((w) => w.id === selected) ?? null;
  const field = { background: "var(--hearth-surface)", borderColor: "var(--hearth-border)", color: "var(--hearth-text)" };
  const primary = { background: "var(--hearth-accent-1)", color: "#1a1a1a" };

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
            <button type="button" onClick={() => setAdding((a) => !a)} className="rounded-lg px-3 py-1.5 font-semibold" style={primary}>
              + Add widget
            </button>
            <Link href={`/boards/${board.id}/view`} className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--hearth-border)" }}>
              Full screen ↗
            </Link>
          </div>
        </header>

        {adding && (
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border p-3 sm:grid-cols-4" style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}>
            {WIDGET_TYPES.map((t) => (
              <button key={t} type="button" onClick={() => void add(t)} className="rounded-lg border p-3 text-left text-sm hover:opacity-90" style={{ borderColor: "var(--hearth-border)", background: "var(--hearth-bg)" }}>
                <span className="block font-semibold">{WIDGET_META[t].label}</span>
                <span className="block text-xs" style={{ color: "var(--hearth-text-muted)" }}>
                  {WIDGET_META[t].description}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className={`grid grid-cols-1 gap-4 ${board.canvas === "PORTRAIT" ? "lg:grid-cols-[minmax(0,560px)_1fr]" : "lg:grid-cols-[1fr_320px]"}`}>
          <div className="rounded-xl border" style={{ borderColor: "var(--hearth-border)" }} onPointerDown={() => setSelected(null)}>
            <BoardCanvas vars={vars} width={size.w} height={size.h} onScaleChange={(s) => (scaleRef.current = s)}>
              {backdrop}
              {widgets.map((w) => (
                <div key={w.id}>
                  <div onPointerDown={(e) => startDrag(e, w.id, "move")} style={{ position: "absolute", left: 0, top: 0, cursor: "move", touchAction: "none" }}>
                    <WidgetFrame type={w.type} x={w.x} y={w.y} w={w.w} h={w.h} z={10 + w.z} plain={WIDGET_META[w.type].plain} translucent={hasWallpaper}>
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
                      outline: selected === w.id ? "3px solid var(--hearth-accent-1)" : "1px dashed rgb(128 128 128 / 0.45)",
                      borderRadius: 14,
                      pointerEvents: "none",
                    }}
                  />
                  {/* Resize handle — always visible, bigger, and labeled on hover. */}
                  <div
                    onPointerDown={(e) => startDrag(e, w.id, "resize")}
                    title="Drag to resize"
                    style={{
                      position: "absolute",
                      left: w.x + w.w - 36,
                      top: w.y + w.h - 36,
                      width: 36,
                      height: 36,
                      zIndex: 1001 + w.z,
                      cursor: "nwse-resize",
                      touchAction: "none",
                      background: "var(--hearth-accent-1)",
                      borderRadius: 8,
                      opacity: selected === w.id ? 1 : 0.6,
                      boxShadow: "0 1px 4px rgb(0 0 0 / 0.4)",
                    }}
                  />
                </div>
              ))}
            </BoardCanvas>
            {wallpaperCredit ? (
              <p className="px-3 py-1 text-[11px]" style={{ color: "var(--hearth-text-muted)" }}>
                Wallpaper: {wallpaperCredit}
                {moodLabel ? ` · Weather mood: ${moodLabel}` : ""}
              </p>
            ) : null}
          </div>

          <aside className="rounded-xl border p-4 text-sm" style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}>
            <div className="mb-3 flex gap-1 rounded-lg p-1" style={{ background: "var(--hearth-bg)" }}>
              {(["widgets", "display"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTab(t)} className="flex-1 rounded-md px-2 py-1.5 text-sm font-semibold capitalize" style={tab === t ? primary : { color: "var(--hearth-text-muted)" }}>
                  {t}
                </button>
              ))}
            </div>

            {tab === "display" ? (
              <DisplaySettings board={board} themes={themes} collections={collections} suggestedScrim={suggestedScrim} onSave={(p) => void saveBoard(p)} onWallpaper={(a) => void wallpaperAction(a)} />
            ) : sel ? (
              <WidgetSettings key={`${sel.id}:${JSON.stringify(sel.config)}`} widget={sel} canvas={board.canvas} onSave={(c) => void saveConfig(sel.id, c)} onGeometry={(g) => void api(`/api/boards/${board.id}/widgets/${sel.id}`, { method: "PATCH", body: JSON.stringify({ geometry: g }) }).then((ok) => ok && router.refresh())} onRemove={() => void remove(sel.id)} />
            ) : (
              <>
                <h2 className="font-semibold">Editing {name}</h2>
                <p className="mt-1" style={{ color: "var(--hearth-text-muted)" }}>
                  Drag a widget to move it. Drag the gold corner square to resize. Tap one for its settings. Positions save automatically and snap to a {GRID}px grid on the {size.w}×{size.h} canvas.
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

  function DisplaySettings({
    board,
    themes,
    collections,
    suggestedScrim,
    onSave,
    onWallpaper,
  }: {
    board: EditorBoard;
    themes: ThemeDef[];
    collections: CollectionInfo[];
    suggestedScrim: number | null;
    onSave: (patch: Record<string, unknown>) => void;
    onWallpaper: (a: "next" | "pin" | "skip") => void;
  }) {
    const [scrim, setScrim] = useState<number>(board.scrimOpacityOverride ?? suggestedScrim ?? 0.4);
    const [strength, setStrength] = useState(board.weatherMoodStrength);
    const label = "block text-xs font-semibold uppercase tracking-wide";
    return (
      <div className="space-y-4">
        <section>
          <span className={label} style={{ color: "var(--hearth-text-muted)" }}>Theme</span>
          <select value={board.theme} onChange={(e) => onSave({ theme: e.target.value })} className="mt-1 w-full rounded-lg border px-2 py-1.5" style={field}>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </section>

        <section>
          <span className={label} style={{ color: "var(--hearth-text-muted)" }}>Screen shape</span>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {CANVAS_PRESET_IDS.map((id) => (
              <button key={id} type="button" onClick={() => onSave({ canvas: id })} className="rounded-lg border px-2 py-1.5 text-xs font-semibold" style={board.canvas === id ? primary : field} title={CANVAS_PRESETS[id].hint}>
                {CANVAS_PRESETS[id].label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px]" style={{ color: "var(--hearth-text-muted)" }}>
            Widgets keep their positions; re-drag anything that lands off the new canvas.
          </p>
        </section>

        <section>
          <span className={label} style={{ color: "var(--hearth-text-muted)" }}>Wallpaper</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onSave({ wallpaperCollectionId: null })} className="rounded-lg border p-2 text-left text-xs" style={board.wallpaperCollectionId === null ? { ...field, borderColor: "var(--hearth-accent-1)" } : field}>
              <span className="block font-semibold">None</span>
              <span style={{ color: "var(--hearth-text-muted)" }}>Theme color only</span>
            </button>
            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSave({ wallpaperCollectionId: c.id })}
                className="overflow-hidden rounded-lg border text-left text-xs"
                style={{ ...field, borderColor: board.wallpaperCollectionId === c.id ? "var(--hearth-accent-1)" : "var(--hearth-border)", borderWidth: board.wallpaperCollectionId === c.id ? 2 : 1 }}
              >
                {c.cover ? <img src={`${c.cover.basePath}-1920.webp`} alt="" className="h-16 w-full object-cover" style={{ background: `center / cover url(${c.cover.lqip})` }} loading="lazy" /> : <div className="h-16" />}
                <span className="block px-2 py-1 font-semibold">{c.name}</span>
                <span className="block px-2 pb-1" style={{ color: "var(--hearth-text-muted)" }}>
                  {c.count} photos{c.isBuiltin ? "" : " · yours"}
                  {!c.isBuiltin && c.count === 0 && !c.lastError ? " · syncing…" : ""}
                </span>
                {c.lastError ? (
                  <span className="block px-2 pb-1 text-[11px]" style={{ color: "var(--hearth-accent-4)" }}>
                    {c.lastError}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <AddOwnCollection onCreated={(id) => onSave({ wallpaperCollectionId: id })} />
          {board.wallpaperCollectionId ? (
            <div className="mt-2 space-y-2">
              <div className="flex gap-1">
                <button type="button" onClick={() => onWallpaper("next")} className="flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold" style={field}>Next</button>
                <button type="button" onClick={() => onWallpaper("pin")} className="flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold" style={board.pinned ? primary : field}>{board.pinned ? "Pinned" : "Pin this one"}</button>
                <button type="button" onClick={() => onWallpaper("skip")} className="flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold" style={field}>Skip</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">
                  Rotate
                  <select value={board.wallpaperRotation} onChange={(e) => onSave({ wallpaperRotation: e.target.value })} className="mt-1 w-full rounded-lg border px-2 py-1" style={field}>
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly (Mon 4am)</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="MANUAL">Manual</option>
                  </select>
                </label>
                <label className="text-xs">
                  Order
                  <select value={board.wallpaperOrder} onChange={(e) => onSave({ wallpaperOrder: e.target.value })} className="mt-1 w-full rounded-lg border px-2 py-1" style={field}>
                    <option value="SEQUENTIAL">In order</option>
                    <option value="SHUFFLE">Shuffle</option>
                  </select>
                </label>
              </div>
              <label className="block text-xs">
                Darken photo behind widgets · {Math.round(scrim * 100)}%{board.scrimOpacityOverride === null ? " (auto)" : ""}
                <input type="range" min={0} max={0.85} step={0.01} value={scrim} onChange={(e) => setScrim(Number(e.target.value))} onMouseUp={() => onSave({ scrimOpacityOverride: scrim })} onTouchEnd={() => onSave({ scrimOpacityOverride: scrim })} className="mt-1 w-full" />
              </label>
              <div className="flex gap-1">
                <button type="button" onClick={() => onSave({ scrimOpacityOverride: null })} className="rounded-lg border px-2 py-1 text-[11px]" style={field}>Auto from photo</button>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={board.matchPaletteToWallpaper} onChange={(e) => onSave({ matchPaletteToWallpaper: e.target.checked })} />
                  Match colors to wallpaper
                </label>
              </div>
            </div>
          ) : null}
        </section>

        <section>
          <span className={label} style={{ color: "var(--hearth-text-muted)" }}>Weather mood</span>
          <label className="mt-1 flex items-center gap-2">
            <input type="checkbox" checked={board.weatherMood} onChange={(e) => onSave({ weatherMood: e.target.checked })} />
            Let the weather set the mood (sun warms it, rain darkens it, storms flash)
          </label>
          {board.weatherMood ? (
            <label className="mt-2 block text-xs">
              Strength · {strength}%
              <input type="range" min={0} max={100} step={5} value={strength} onChange={(e) => setStrength(Number(e.target.value))} onMouseUp={() => onSave({ weatherMoodStrength: strength })} onTouchEnd={() => onSave({ weatherMoodStrength: strength })} className="mt-1 w-full" />
            </label>
          ) : null}
          <p className="mt-1 text-[11px]" style={{ color: "var(--hearth-text-muted)" }}>
            Follows the town on this display&apos;s weather widget. Raindrops and lightning turn off automatically on low-power screens.
          </p>
        </section>
      </div>
    );
  }
}

/** "Add your own" (spec §7): name + Google Photos album / Drive folder link → private collection. */
function AddOwnCollection({ onCreated }: { onCreated: (id: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = { background: "var(--hearth-bg)", borderColor: "var(--hearth-border)", color: "var(--hearth-text)" };
  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/wallpapers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, link }) });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !body?.id) {
        setErr(body?.error ?? "Couldn't add that.");
        return;
      }
      setOpen(false);
      setName("");
      setLink("");
      onCreated(body.id);
      router.refresh();
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 w-full rounded-lg border border-dashed px-3 py-2 text-left text-xs" style={{ borderColor: "var(--hearth-accent-1)", color: "var(--hearth-text)" }}>
        <span className="block font-semibold">+ Add your own collection</span>
        <span style={{ color: "var(--hearth-text-muted)" }}>Anime, your vacation, the kids’ season — paste a Google Photos album or Drive folder link. It syncs every 15 minutes.</span>
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-lg border p-2" style={{ borderColor: "var(--hearth-accent-1)" }}>
      <input placeholder="Collection name (e.g. Anime)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={input} />
      <input type="url" placeholder="https://photos.app.goo.gl/… or a Drive folder link" value={link} onChange={(e) => setLink(e.target.value)} maxLength={2048} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={input} autoComplete="off" spellCheck={false} />
      <p className="text-[11px]" style={{ color: "var(--hearth-text-muted)" }}>
        Images need 1920px+ on the long edge. Only you can see this collection. The link is stored encrypted and never shown again.
      </p>
      <p aria-live="polite" className="min-h-4 text-[11px]" style={{ color: "var(--hearth-accent-4)" }}>{err}</p>
      <div className="flex gap-2">
        <button type="button" disabled={busy || !name.trim() || !link.trim()} onClick={() => void create()} className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: "var(--hearth-accent-1)", color: "#1a1a1a" }}>
          {busy ? "Adding…" : "Add collection"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--hearth-border)" }}>Cancel</button>
      </div>
    </div>
  );
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || raw.trim() === "") return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function WidgetSettings({
  widget,
  canvas,
  onSave,
  onGeometry,
  onRemove,
}: {
  widget: BoardWidgetRow;
  canvas: CanvasPreset;
  onSave: (config: unknown) => void;
  onGeometry: (g: { x: number; y: number; w: number; h: number; z: number }) => void;
  onRemove: () => void;
}) {
  const input = { background: "var(--hearth-bg)", borderColor: "var(--hearth-border)", color: "var(--hearth-text)" };
  const field = "mt-1 w-full rounded-lg border px-3 py-1.5";
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...(safeWidgetConfig(widget.type, widget.config) as Record<string, unknown>) }));
  const [w, setW] = useState(widget.w);
  const [h, setH] = useState(widget.h);
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  const max = canvasSize(canvas);

  return (
    <div>
      <h2 className="font-semibold">{WIDGET_META[widget.type].label}</h2>
      <p className="mt-1 text-xs" style={{ color: "var(--hearth-text-muted)" }}>
        {WIDGET_META[widget.type].description}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border p-2" style={{ borderColor: "var(--hearth-border)" }}>
        <label className="text-xs">
          Width
          <input type="number" min={WIDGET_META[widget.type].minSize.w} max={max.w} step={GRID} className={field} style={input} value={w} onChange={(e) => setW(clampInt(e.target.value, WIDGET_META[widget.type].minSize.w, max.w, widget.w))} onBlur={() => onGeometry({ x: widget.x, y: widget.y, w, h, z: widget.z })} />
        </label>
        <label className="text-xs">
          Height
          <input type="number" min={WIDGET_META[widget.type].minSize.h} max={max.h} step={GRID} className={field} style={input} value={h} onChange={(e) => setH(clampInt(e.target.value, WIDGET_META[widget.type].minSize.h, max.h, widget.h))} onBlur={() => onGeometry({ x: widget.x, y: widget.y, w, h, z: widget.z })} />
        </label>
      </div>

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
              Style
              <select className={field} style={input} value={String(draft["style"] ?? "digital")} onChange={(e) => set("style", e.target.value)}>
                {CLOCK_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s === "digital" ? "Digital — big numerals" : s === "analog" ? "Analog — a face with hands" : s === "minimal" ? "Minimal — small and quiet" : "Stacked — hours over minutes"}
                  </option>
                ))}
              </select>
            </label>
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
          <>
            <label className="block">
              Days shown (1–14)
              <input type="number" min={1} max={14} className={field} style={input} value={Number(draft["days"] ?? 7)} onChange={(e) => set("days", clampInt(e.target.value, 1, 14, 7))} />
            </label>
            <LinkField
              label="Calendar link (Google Calendar “secret address in iCal format”, iCloud public calendar, or any .ics)"
              mask={typeof draft["icsMask"] === "string" ? (draft["icsMask"] as string) : null}
              onChange={(v) => set("icsUrl", v)}
              onClear={() => set("icsUrl", "")}
            />
          </>
        )}
        {widget.type === "photos" && (
          <>
            <label className="block">
              Seconds per photo (5–600)
              <input type="number" min={5} max={600} className={field} style={input} value={Number(draft["intervalSec"] ?? 20)} onChange={(e) => set("intervalSec", clampInt(e.target.value, 5, 600, 20))} />
            </label>
            <LinkField
              label="Photo source (Google Photos shared album link, or a Google Drive folder shared with “anyone with the link”)"
              mask={typeof draft["linkMask"] === "string" ? (draft["linkMask"] as string) : null}
              onChange={(v) => set("linkUrl", v)}
              onClear={() => set("linkUrl", "")}
            />
          </>
        )}
        {widget.type === "notes" && (
          <label className="block">
            Note
            <textarea className={field} style={input} rows={5} maxLength={2000} value={String(draft["text"] ?? "")} onChange={(e) => set("text", e.target.value)} />
          </label>
        )}
        {widget.type === "quote" && <p style={{ color: "var(--hearth-text-muted)" }}>Nothing to configure — a new line every day.</p>}
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

/** A credential input: shows a masked value once saved, never the link itself. */
function LinkField({ label, mask, onChange, onClear }: { label: string; mask: string | null; onChange: (v: string) => void; onClear: () => void }) {
  const [editing, setEditing] = useState(mask === null);
  const [value, setValue] = useState("");
  const input = { background: "var(--hearth-bg)", borderColor: "var(--hearth-border)", color: "var(--hearth-text)" };
  return (
    <div className="block">
      <span className="text-xs">{label}</span>
      {editing ? (
        <input
          type="url"
          placeholder="https://…"
          className="mt-1 w-full rounded-lg border px-3 py-1.5"
          style={input}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            onChange(e.target.value);
          }}
          autoComplete="off"
          spellCheck={false}
        />
      ) : (
        <div className="mt-1 flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs" style={input}>
          <span>Saved · {mask}</span>
          <span className="flex gap-2">
            <button type="button" className="underline" onClick={() => setEditing(true)}>
              Replace
            </button>
            <button type="button" className="underline" onClick={onClear}>
              Remove
            </button>
          </span>
        </div>
      )}
      <p className="mt-1 text-[11px]" style={{ color: "var(--hearth-text-muted)" }}>
        Treated as a password: encrypted on save, shown only as the site name afterwards, never in logs.
      </p>
    </div>
  );
}
