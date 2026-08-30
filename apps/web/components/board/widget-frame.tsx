import type { ReactNode } from "react";

/** Stable styling target: data-widget + data-part, never Tailwind classes (plan §7.6). */
export function WidgetFrame({
  type,
  x,
  y,
  w,
  h,
  z,
  children,
  plain = false,
}: {
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  children: ReactNode;
  /** No surface card — for widgets that are pure text on the background. */
  plain?: boolean;
}) {
  return (
    <div
      data-widget={type}
      data-part="frame"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        zIndex: z,
        boxSizing: "border-box",
        borderRadius: "var(--hearth-radius, 14px)",
        background: plain ? "transparent" : "var(--hearth-surface)",
        border: plain ? "none" : "1px solid var(--hearth-border)",
        boxShadow: plain ? "none" : "var(--hearth-shadow, none)",
        overflow: "hidden",
        padding: plain ? 0 : 24,
      }}
    >
      {children}
    </div>
  );
}
