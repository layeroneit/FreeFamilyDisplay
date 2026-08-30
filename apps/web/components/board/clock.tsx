"use client";

import { useEffect, useState } from "react";

/**
 * Clock widget. Updates on a timeout aligned to the next boundary — no 60 Hz
 * loop (plan §7.8). Renders the server's time first so there is no flash.
 */
export function ClockWidget({ format, showSeconds }: { format: "12h" | "24h"; showSeconds: boolean }) {
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
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const ampm = format === "12h" ? (h24 < 12 ? "AM" : "PM") : "";

  return (
    <div
      data-part="time"
      style={{ display: "flex", alignItems: "baseline", gap: 12, height: "100%", justifyContent: "flex-end" }}
    >
      <span
        style={{
          fontSize: 112,
          fontWeight: 600,
          lineHeight: 1,
          fontFamily: "var(--hearth-font-display)",
          letterSpacing: -2,
        }}
      >
        {format === "24h" ? String(h).padStart(2, "0") : h}:{mm}
        {showSeconds ? <span style={{ fontSize: 48, color: "var(--hearth-text-muted)" }}>:{ss}</span> : null}
      </span>
      {ampm ? <span style={{ fontSize: 32, color: "var(--hearth-text-muted)", fontWeight: 500 }}>{ampm}</span> : null}
    </div>
  );
}
