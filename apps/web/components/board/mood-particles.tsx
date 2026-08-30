"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Tier-2 ambiance (plan §7.7.5): rain streaks, drifting snow, rolling fog,
 * and a rare lightning flash. CSS-transform animations only, capped particle
 * counts, and nothing at all when the viewer prefers reduced motion. The
 * kiosk on a low-power display renders Tier 1 (tint) instead — the caller
 * decides via the `effects` flag on BoardBackdrop.
 */
export function MoodParticles({ kind }: { kind: "rain" | "snow" | "fog" | "storm" }) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Deterministic layout per mount so SSR/CSR agree.
  const drops = useMemo(() => {
    const n = kind === "snow" ? 60 : 90;
    let seed = 42;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: n }, () => ({ x: rnd() * 100, delay: rnd() * 4, dur: 1.2 + rnd() * 1.6, size: 0.6 + rnd() }));
  }, [kind]);

  if (reduced) return null;

  if (kind === "fog") {
    return (
      <div data-part="mood-fog" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }} aria-hidden>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="mood-fog-band"
            style={{
              position: "absolute",
              left: "-50%",
              top: `${20 + i * 25}%`,
              width: "200%",
              height: "30%",
              background: "radial-gradient(ellipse at center, rgb(255 255 255 / 0.22), transparent 70%)",
              animationDuration: `${40 + i * 15}s`,
              animationDelay: `${-i * 10}s`,
            }}
          />
        ))}
      </div>
    );
  }

  const isSnow = kind === "snow";
  return (
    <div data-part={`mood-${kind}`} style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }} aria-hidden>
      {drops.map((d, i) => (
        <span
          key={i}
          className={isSnow ? "mood-flake" : "mood-drop"}
          style={{
            position: "absolute",
            left: `${d.x}%`,
            top: -40,
            width: isSnow ? 6 * d.size : 2,
            height: isSnow ? 6 * d.size : 60 * d.size,
            borderRadius: isSnow ? "50%" : 2,
            background: isSnow ? "rgb(255 255 255 / 0.85)" : "linear-gradient(rgb(255 255 255 / 0), rgb(200 220 255 / 0.55))",
            animationDuration: `${isSnow ? d.dur * 5 : d.dur}s`,
            animationDelay: `${-d.delay}s`,
          }}
        />
      ))}
      {kind === "storm" ? <div className="mood-lightning" style={{ position: "absolute", inset: 0, background: "#fff", opacity: 0 }} /> : null}
    </div>
  );
}
