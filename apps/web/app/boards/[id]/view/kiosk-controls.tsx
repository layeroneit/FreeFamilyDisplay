"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CanvasPreset } from "@/lib/board/widgets";

const LABEL: Record<CanvasPreset, string> = { LANDSCAPE: "landscape", PORTRAIT: "portrait", ULTRAWIDE: "ultrawide" };

/** Classifies the physical screen the browser is on (not the window). */
export function detectScreenShape(w: number, h: number): CanvasPreset {
  if (h > w) return "PORTRAIT";
  if (w / h >= 2.1) return "ULTRAWIDE";
  return "LANDSCAPE";
}

/**
 * Overlay for the wall screen. On first load it reads the screen's real
 * dimensions, suggests switching the display's shape when it doesn't match,
 * and offers a single "Start" that goes fullscreen (browsers need a gesture
 * for that) and hides the cursor. Once started, nothing is shown until the
 * pointer moves; it fades again after a few seconds of stillness.
 */
export function KioskControls({ boardId, canvas }: { boardId: string; canvas: CanvasPreset }) {
  const router = useRouter();
  const [detected, setDetected] = useState<CanvasPreset | null>(null);
  const [screenText, setScreenText] = useState("");
  const [started, setStarted] = useState(false);
  const [awake, setAwake] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dismissedShape, setDismissedShape] = useState(false);

  useEffect(() => {
    const s = window.screen;
    setDetected(detectScreenShape(s.width, s.height));
    setScreenText(`${s.width}×${s.height}`);
    setStarted(Boolean(document.fullscreenElement));
    const onFs = () => setStarted(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Cursor + chrome auto-hide once running.
  useEffect(() => {
    if (!started) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const wake = () => {
      setAwake(true);
      document.body.style.cursor = "";
      clearTimeout(t);
      t = setTimeout(() => {
        setAwake(false);
        document.body.style.cursor = "none";
      }, 4000);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(t);
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [started]);

  const start = async () => {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      // Fullscreen unavailable (embedded browser, kiosk flag already on) — treat as started.
    }
    setStarted(true);
    try {
      localStorage.setItem("ffd:kiosk:lastBoard", boardId);
    } catch {
      // storage blocked; nothing to remember
    }
  };

  const switchShape = async () => {
    if (!detected) return;
    setBusy(true);
    const res = await fetch(`/api/boards/${boardId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ canvas: detected }),
    });
    setBusy(false);
    if (res.ok) {
      setDismissedShape(true);
      router.refresh();
    }
  };

  const mismatch = detected !== null && detected !== canvas && !dismissedShape;
  if (started && !awake) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-6" style={{ transition: "opacity 300ms" }}>
      <div
        className="pointer-events-auto flex max-w-xl flex-wrap items-center gap-3 rounded-2xl px-5 py-3 text-sm shadow-2xl"
        style={{ background: "rgba(20,20,24,0.85)", color: "#f4f4f5", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.12)" }}
      >
        {mismatch ? (
          <>
            <span>
              This screen is <strong>{screenText}</strong> — looks {LABEL[detected]}, but this display is set to {LABEL[canvas]}.
            </span>
            <button type="button" disabled={busy} onClick={() => void switchShape()} className="rounded-lg px-3 py-1.5 font-semibold" style={{ background: "#f4d35e", color: "#1a1a1a" }}>
              {busy ? "Switching…" : `Switch to ${LABEL[detected]}`}
            </button>
            <button type="button" onClick={() => setDismissedShape(true)} className="rounded-lg px-3 py-1.5 underline">
              Keep
            </button>
          </>
        ) : null}
        {!started ? (
          <button type="button" onClick={() => void start()} className="rounded-lg px-4 py-1.5 font-semibold" style={{ background: "#f4d35e", color: "#1a1a1a" }}>
            ▶ Start on this screen
          </button>
        ) : (
          <span style={{ opacity: 0.7 }}>Running · press Esc to leave fullscreen</span>
        )}
        <a href="/dashboard" className="underline" style={{ opacity: 0.7 }}>
          Back
        </a>
      </div>
    </div>
  );
}
