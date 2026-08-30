"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CANVAS_H, CANVAS_W } from "@/lib/board/widgets";

/**
 * The fixed 1920×1080 canvas (plan §7.1). The editor and the kiosk both use
 * this — one renderer, scaled to fit whatever container it lands in with a
 * single CSS transform. No responsive reflow, ever.
 */
export function BoardCanvas({
  vars,
  children,
  className,
}: {
  vars: Record<string, string>;
  children: ReactNode;
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setScale(Math.min(r.width / CANVAS_W, r.height / CANVAS_H) || 0.5);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={outer}
      className={`relative w-full overflow-hidden ${className ?? ""}`}
      style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
    >
      <div
        data-canvas
        className="absolute left-0 top-0 origin-top-left"
        style={{
          ...vars,
          width: CANVAS_W,
          height: CANVAS_H,
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
