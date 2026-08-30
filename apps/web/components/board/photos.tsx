"use client";

import { useEffect, useState } from "react";

/** Rotating photo panel. Crossfade on a timer; reduced-motion gets a single frame. */
export function PhotosWidget({ srcs, intervalSec, note }: { srcs: string[]; intervalSec: number; note?: string }) {
  const [i, setI] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (reduced || srcs.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % srcs.length), Math.max(5, intervalSec) * 1000);
    return () => clearInterval(id);
  }, [reduced, srcs.length, intervalSec]);

  if (srcs.length === 0) {
    return <div style={{ color: "var(--hearth-text-muted)", fontSize: 24 }}>No photos yet.</div>;
  }
  return (
    <div data-part="photos" style={{ position: "absolute", inset: 0 }}>
      {srcs.map((s, n) => (
        <img
          key={s}
          src={s}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: n === i ? 1 : 0,
            transition: reduced ? "none" : "opacity 1200ms ease-in-out",
          }}
          draggable={false}
        />
      ))}
      {note ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "8px 14px",
            fontSize: 16,
            color: "rgb(255 255 255 / 0.85)",
            background: "linear-gradient(transparent, rgb(0 0 0 / 0.55))",
          }}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
}
