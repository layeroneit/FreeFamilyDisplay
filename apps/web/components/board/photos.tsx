"use client";

import { useEffect, useState } from "react";

/** Rotating photo panel. Crossfade on a timer; reduced-motion gets a single frame. */
export function PhotosWidget({ srcs, intervalSec, note }: { srcs: string[]; intervalSec: number; note?: string }) {
  // Index is derived from the wall clock, never accumulated in state: the
  // board reloads every 5 minutes and the kiosk watchdog relaunches the
  // browser besides, and a counter starting from 0 each time means nothing
  // past the first handful of photos is ever seen. Server render starts at 0
  // to keep hydration stable; the effect below corrects it on mount.
  const [i, setI] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const period = Math.max(5, intervalSec) * 1000;
  const count = srcs.length;

  useEffect(() => {
    if (count === 0) return;
    const at = (t: number) => Math.floor(t / period) % count;
    // Land on the photo that *should* be showing right now, whatever happened
    // before — refresh, crash, reboot.
    setI(at(Date.now()));
    if (reduced || count < 2) return;
    let timer: ReturnType<typeof setTimeout>;
    // Re-align to the wall clock on every tick rather than trusting a fixed
    // interval: setInterval drifts, and a backgrounded tab is throttled.
    const tick = () => {
      const now = Date.now();
      setI(at(now));
      timer = setTimeout(tick, period - (now % period));
    };
    timer = setTimeout(tick, period - (Date.now() % period));
    return () => clearTimeout(timer);
  }, [reduced, count, period]);

  if (srcs.length === 0) {
    return <div style={{ color: "var(--hearth-text-muted)", fontSize: 24 }}>No photos yet.</div>;
  }
  // Never index past the end if the set shrank under us — no blank frame.
  const current = i % srcs.length;
  // Mount three frames, not the whole album. Rendering every <img> meant a
  // 400-photo album put 400 decoded images in memory on a Raspberry Pi that is
  // also driving a screen. The outgoing frame has to stay mounted for the
  // crossfade, and the incoming one has to be mounted early enough for the
  // browser to have fetched it, so the window is exactly [previous, current,
  // next] — deduped, because a one- or two-photo album overlaps. Named
  // `frames`, not `window`: a local called window shadows the global one and
  // silently breaks the matchMedia call above.
  const frames = [...new Set([(current - 1 + srcs.length) % srcs.length, current, (current + 1) % srcs.length])];
  return (
    <div data-part="photos" style={{ position: "absolute", inset: 0 }}>
      {frames.map((n) => (
        <img
          key={`${n}:${srcs[n]}`}
          src={srcs[n]}
          alt=""
          // The next frame is mounted only to warm the cache; it must not be
          // announced, and it must not be lazy or the preload does nothing.
          aria-hidden={n !== current}
          loading="eager"
          decoding="async"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: n === current ? 1 : 0,
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
