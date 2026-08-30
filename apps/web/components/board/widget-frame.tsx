import type { ReactNode } from "react";

/**
 * Stable styling target: data-widget + data-part, never Tailwind classes (plan §7.6).
 *
 * `translucent` is the wallpaper treatment (spec §2): the surface at ~75%
 * over a blurred backdrop, so text stays readable and the photo stays visible.
 * `reduceEffects` swaps the blur for a higher-opacity solid fill — the
 * low-power display path (§7.8).
 */
export function WidgetFrame({
  type,
  x,
  y,
  w,
  h,
  z,
  children,
  plain = false,
  translucent = false,
  reduceEffects = false,
}: {
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  children: ReactNode;
  plain?: boolean;
  translucent?: boolean;
  reduceEffects?: boolean;
}) {
  const surface = translucent
    ? reduceEffects
      ? "color-mix(in srgb, var(--hearth-surface) 88%, transparent)"
      : "color-mix(in srgb, var(--hearth-surface) 72%, transparent)"
    : "var(--hearth-surface)";
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
        background: plain ? "transparent" : surface,
        border: plain ? "none" : "1px solid var(--hearth-border)",
        boxShadow: plain ? "none" : "var(--hearth-shadow, none)",
        backdropFilter: !plain && translucent && !reduceEffects ? "blur(14px)" : undefined,
        WebkitBackdropFilter: !plain && translucent && !reduceEffects ? "blur(14px)" : undefined,
        overflow: "hidden",
        padding: plain ? 0 : 24,
        // Bare text over a photo needs its own legibility aid.
        textShadow: plain && translucent ? "0 1px 6px rgb(0 0 0 / 0.55)" : undefined,
      }}
    >
      {children}
    </div>
  );
}
