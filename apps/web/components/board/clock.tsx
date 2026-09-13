"use client";

import { useEffect, useState } from "react";

export type ClockStyle = "digital" | "analog" | "minimal" | "stacked";

/**
 * Clock widget. Updates on a timeout aligned to the next boundary — no 60 Hz
 * loop (plan §7.8). Renders the server's time first so there is no flash.
 *
 * Styles: digital (big numerals), minimal (small, quiet), stacked (hours over
 * minutes — reads well in a narrow portrait column), analog (a face with
 * hands; the second hand only when showSeconds is on).
 */
export function ClockWidget({
  format,
  showSeconds,
  style = "digital",
  festive,
}: {
  format: "12h" | "24h";
  showSeconds: boolean;
  style?: ClockStyle;
  /** Game day: contrast-checked team ink for the numerals. */
  festive?: string | undefined;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      const step = showSeconds ? 1000 : 60_000;
      const ms = step - (d.getTime() % step);
      t = setTimeout(tick, ms || step);
    };
    tick();
    return () => clearTimeout(t);
  }, [showSeconds]);

  const h24 = now.getHours();
  const h = format === "12h" ? h24 % 12 || 12 : h24;
  const hh = format === "24h" ? String(h).padStart(2, "0") : String(h);
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const ampm = format === "12h" ? (h24 < 12 ? "AM" : "PM") : "";
  const display = "var(--hearth-font-display)";
  const numerals = festive;
  // The year lives here now — the calendar's month band carried it until the
  // operator called the band a duplicate of the date widget (2026-09-13),
  // and nothing else on the board says the year. Muted on an ordinary day,
  // team ink on game day, like the calendar's labels.
  const year = String(now.getFullYear());
  const yearStyle = { fontSize: 22, fontWeight: 500, letterSpacing: 2, color: festive ?? "var(--hearth-text-muted)" } as const;

  if (style === "analog") {
    const sec = now.getSeconds();
    const min = now.getMinutes() + sec / 60;
    const hr = (h24 % 12) + min / 60;
    const hand = (deg: number, len: number, w: number, color: string) => (
      <line x1="50" y1="50" x2="50" y2={50 - len} stroke={color} strokeWidth={w} strokeLinecap="round" transform={`rotate(${deg} 50 50)`} />
    );
    return (
      <div data-part="analog" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 4 }}>
        <svg viewBox="0 0 100 100" style={{ minHeight: 0, flex: 1, aspectRatio: "1" }} aria-label={`${hh}:${mm}${ampm ? " " + ampm : ""}`}>
          <circle cx="50" cy="50" r="47" fill="var(--hearth-surface)" stroke="var(--hearth-border)" strokeWidth="2" />
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} x1="50" y1="6" x2="50" y2={i % 3 === 0 ? 13 : 10} stroke={i % 3 === 0 ? "var(--hearth-accent-1)" : "var(--hearth-text-muted)"} strokeWidth={i % 3 === 0 ? 2.5 : 1.5} transform={`rotate(${i * 30} 50 50)`} />
          ))}
          {hand(hr * 30, 24, 4, festive ?? "var(--hearth-text)")}
          {hand(min * 6, 34, 3, festive ?? "var(--hearth-text)")}
          {showSeconds ? hand(sec * 6, 38, 1, "var(--hearth-accent-1)") : null}
          <circle cx="50" cy="50" r="3" fill="var(--hearth-accent-1)" />
        </svg>
        <span data-part="year" style={{ ...yearStyle, fontSize: 16 }}>{year}</span>
      </div>
    );
  }

  if (style === "stacked") {
    return (
      <div data-part="time" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", height: "100%", lineHeight: 0.9, fontFamily: display, fontWeight: 600 }}>
        <span style={{ fontSize: 120, letterSpacing: -3, color: numerals }}>{hh}</span>
        <span style={{ fontSize: 120, letterSpacing: -3, color: "var(--hearth-accent-1)" }}>{mm}</span>
        {ampm ? <span style={{ fontSize: 24, color: "var(--hearth-text-muted)", marginTop: 8 }}>{ampm}</span> : null}
        <span data-part="year" style={{ ...yearStyle, marginTop: 6 }}>{year}</span>
      </div>
    );
  }

  if (style === "minimal") {
    return (
      <div data-part="time" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", height: "100%", fontFamily: display }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 56, fontWeight: 500, letterSpacing: -1, color: numerals }}>
            {hh}:{mm}
          </span>
          {showSeconds ? <span style={{ fontSize: 24, color: "var(--hearth-text-muted)" }}>{ss}</span> : null}
          {ampm ? <span style={{ fontSize: 18, color: "var(--hearth-text-muted)" }}>{ampm}</span> : null}
        </div>
        <span data-part="year" style={{ ...yearStyle, fontSize: 16 }}>{year}</span>
      </div>
    );
  }

  return (
    <div data-part="time" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, justifyContent: "flex-end" }}>
        <span style={{ fontSize: 112, fontWeight: 600, lineHeight: 1, fontFamily: display, letterSpacing: -2, color: numerals }}>
          {hh}:{mm}
          {showSeconds ? <span style={{ fontSize: 48, color: "var(--hearth-text-muted)" }}>:{ss}</span> : null}
        </span>
        {ampm ? <span style={{ fontSize: 32, color: "var(--hearth-text-muted)", fontWeight: 500 }}>{ampm}</span> : null}
      </div>
      <span data-part="year" style={{ ...yearStyle, marginTop: 2 }}>{year}</span>
    </div>
  );
}
