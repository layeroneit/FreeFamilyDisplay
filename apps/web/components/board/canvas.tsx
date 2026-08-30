"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CANVAS_H, CANVAS_W } from "@/lib/board/widgets";

/**
 * A fixed pixel canvas (plan §7.1) — one of three presets (landscape,
 * portrait, ultrawide), never reflowed. The editor and the kiosk both use
 * this; it scales to fit whatever container it lands in with a single CSS
 * transform, and fits by height when the container is constrained that way
 * (full-screen view) or by width otherwise (editor).
 */
export function BoardCanvas({
  vars,
  children,
  className,
  width = CANVAS_W,
  height = CANVAS_H,
  onScaleChange,
}: {
  vars: Record<string, string>;
  children: ReactNode;
  className?: string;
  width?: number;
  height?: number;
  /** Reports the current scale so an editor can convert pointer deltas. */
  onScaleChange?: (scale: number) => void;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const report = useRef(onScaleChange);
  report.current = onScaleChange;

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const byW = r.width / width;
      const byH = r.height > 0 ? r.height / height : Infinity;
      const s = Math.min(byW, byH) || 0.5;
      setScale(s);
      report.current?.(s);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  return (
    <div
      ref={outer}
      className={`relative w-full overflow-hidden ${className ?? ""}`}
      style={{ aspectRatio: `${width} / ${height}`, maxHeight: "100%" }}
    >
      <div
        data-canvas
        className="absolute origin-top-left"
        style={{
          ...vars,
          left: "50%",
          top: 0,
          marginLeft: -(width * scale) / 2,
          width,
          height,
          transform: `scale(${scale})`,
          background: "var(--hearth-bg)",
          color: "var(--hearth-text)",
          fontFamily: "var(--hearth-font-body)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
