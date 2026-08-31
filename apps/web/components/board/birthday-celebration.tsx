"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { birthdayGreeting, isCelebrationHour } from "@/lib/board/birthdays";

/** Party colours. Fixed, not the theme accents — a birthday looks the same on
 *  every board, and one-colour confetti doesn't read as confetti. */
const CONFETTI = ["#F43F5E", "#FB923C", "#FACC15", "#4ADE80", "#38BDF8", "#A78BFA", "#F472B6", "#FFFFFF"];
const PIECES = 110;

type Flake = { x: number; w: number; h: number; color: string; dur: number; delay: number; drift: number; tumble: number; round: boolean };

/**
 * Full-screen birthday celebration: confetti pours down the whole board while
 * pennant bunting swings across the top and a letter-by-letter banner, the
 * name with the exclamation it deserves, and a bobbing row of party emoji
 * hold the middle. Fires on the half hour through waking hours (see
 * isCelebrationHour) — moved from hourly on the operator's word, 2026-08-31:
 * a birthday deserves more than sixteen visits.
 *
 * The confetti's motion is structured exactly like the seasonal fall — the
 * outer element only descends, the inner element only tumbles, never both on
 * one transform. The first build combined them and the operator's Pi drew the
 * motion bottom-up; the seasonal pattern is the one this hardware
 * demonstrably renders top-to-bottom.
 *
 * The schedule deliberately does NOT depend on the names prop: the kiosk
 * re-fetches server components every five minutes, handing this component a
 * fresh array each time, and an effect keyed on it would restart the timer
 * forever. Names are read through a ref at fire time.
 */
export function BirthdayCelebration({
  names,
  canvasW,
  canvasH,
  durationSec = 20,
}: {
  names: string[];
  canvasW: number;
  canvasH: number;
  durationSec?: number;
}) {
  const [phase, setPhase] = useState<"idle" | "playing" | "leaving">("idle");
  const namesRef = useRef(names);
  useEffect(() => {
    namesRef.current = names;
  });

  useEffect(() => {
    let boundary: ReturnType<typeof setTimeout> | undefined;
    let fade: ReturnType<typeof setTimeout> | undefined;
    let end: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      const now = new Date();
      // The next LOCAL half-hour boundary (:00 or :30) — never now-plus-
      // milliseconds arithmetic, which drifts across DST.
      const next = new Date(now);
      next.setSeconds(0, 0);
      next.setMinutes(now.getMinutes() < 30 ? 30 : 60);
      boundary = setTimeout(
        () => {
          if (namesRef.current.length > 0 && isCelebrationHour(new Date().getHours())) {
            setPhase("playing");
            clearTimeout(fade);
            clearTimeout(end);
            fade = setTimeout(() => setPhase("leaving"), Math.max(1000, (durationSec - 1.4) * 1000));
            end = setTimeout(() => setPhase("idle"), durationSec * 1000);
          }
          schedule();
        },
        Math.max(1000, next.getTime() - now.getTime()),
      );
    };
    schedule();
    return () => {
      clearTimeout(boundary);
      clearTimeout(fade);
      clearTimeout(end);
    };
  }, [durationSec]);

  // Deterministic, so the confetti is identical every play and there is no
  // hydration mismatch to reconcile.
  const flakes = useMemo<Flake[]>(() => {
    let s = 0x5eed;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    return Array.from({ length: PIECES }, () => ({
      x: r() * 100,
      w: 9 + r() * 11,
      h: 13 + r() * 18,
      color: CONFETTI[Math.floor(r() * CONFETTI.length)]!,
      dur: +(4.6 + r() * 4.2).toFixed(2),
      // Everything is airborne within four seconds: a celebration opens as a
      // downpour, not a trickle.
      delay: +(r() * 4).toFixed(2),
      drift: Math.round((r() - 0.5) * 200),
      tumble: +(0.9 + r() * 1.6).toFixed(2),
      round: r() < 0.22,
    }));
  }, []);

  if (phase === "idle" || names.length === 0) return null;

  const greeting = birthdayGreeting(names);
  const shout = `${greeting.toUpperCase()}!`;
  const unit = canvasW / 1920;
  const nameSize = Math.max(48, Math.min(190 * unit, (canvasW * 0.86) / (Math.max(4, shout.length) * 0.56)));
  const banner = "HAPPY BIRTHDAY!";
  // The name's letters pop after the banner finishes its own sweep.
  const nameDelayBase = banner.length * 0.07 + 0.25;

  // Two swags of pennants across the top: triangles hung on a shallow curve.
  const gw = canvasW;
  const swagY = (t: number) => 26 + Math.sin(t * Math.PI) * 54;
  const pennants = Array.from({ length: 16 }, (_, i) => {
    const x0 = (i / 16) * gw;
    const x1 = ((i + 1) / 16) * gw;
    const y0 = swagY(((i / 16) * 2) % 1);
    const y1 = swagY((((i + 1) / 16) * 2) % 1);
    return `${x0.toFixed(0)},${y0.toFixed(0)} ${x1.toFixed(0)},${y1.toFixed(0)} ${((x0 + x1) / 2).toFixed(0)},${(Math.max(y0, y1) + 58 * unit + 40).toFixed(0)}`;
  });

  return (
    <div
      data-part="birthday"
      className={phase === "leaving" ? "bday-overlay bday-out" : "bday-overlay"}
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 900 }}
    >
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, rgb(0 0 0 / 0.5), rgb(0 0 0 / 0.8))" }} />

      {/* The garland: pennant bunting swinging gently across the top edge.
          Plain JSX on purpose — this project's CLAUDE.md bans innerHTML in
          widget renderers absolutely, and absolute means here too. */}
      <svg
        className="bday-garland"
        aria-hidden
        viewBox={`0 0 ${gw} 200`}
        preserveAspectRatio="none"
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 200 * unit + 40 }}
      >
        <path d={`M0 30 Q ${gw * 0.25} 110 ${gw * 0.5} 30 T ${gw} 30`} fill="none" stroke="#F8FAFC" strokeWidth={4} />
        {pennants.map((pts, i) => (
          <polygon key={i} points={pts} fill={CONFETTI[i % CONFETTI.length]} />
        ))}
      </svg>

      {flakes.map((f, i) => (
        <span
          key={i}
          className="bday-drop"
          style={
            {
              position: "absolute",
              left: `${f.x}%`,
              top: -40,
              animationDuration: `${f.dur}s`,
              animationDelay: `${f.delay}s`,
              "--bday-fall": `${canvasH + 120}px`,
              "--bday-drift": `${f.drift}px`,
            } as CSSProperties
          }
        >
          <span
            className="bday-tumble"
            style={{
              display: "block",
              width: f.w,
              height: f.round ? f.w : f.h,
              borderRadius: f.round ? "50%" : 2,
              background: f.color,
              animationDuration: `${f.tumble}s`,
            }}
          />
        </span>
      ))}

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: `0 ${Math.round(canvasW * 0.06)}px`,
          fontFamily: "var(--hearth-font-display)",
          color: "#FFFFFF",
          textShadow: "0 4px 24px rgb(0 0 0 / 0.7)",
        }}
      >
        {/* HAPPY BIRTHDAY! letter by letter, each in its own party colour,
            each landing with a bounce, hung with a little alternating tilt. */}
        <div style={{ fontSize: Math.round(92 * unit), fontWeight: 800, lineHeight: 1.05, letterSpacing: 4, whiteSpace: "nowrap" }} aria-label="Happy Birthday!">
          {banner.split("").map((ch, i) =>
            ch === " " ? (
              <span key={i}>&nbsp;&nbsp;</span>
            ) : (
              <span
                key={i}
                className="bday-letter"
                style={{ color: CONFETTI[i % CONFETTI.length], animationDelay: `${(i * 0.07).toFixed(2)}s`, "--tilt": `${i % 2 ? 4 : -4}deg` } as CSSProperties}
              >
                {ch}
              </span>
            ),
          )}
        </div>
        <div
          style={{
            fontSize: Math.round(nameSize),
            fontWeight: 800,
            lineHeight: 1.02,
            marginTop: Math.round(14 * unit),
            color: "var(--hearth-accent-1)",
            overflowWrap: "break-word",
            maxWidth: "100%",
            letterSpacing: 2,
          }}
          aria-label={shout}
        >
          {shout.split("").map((ch, i) =>
            ch === " " ? (
              <span key={i}>&nbsp;</span>
            ) : (
              <span key={i} className="bday-letter" style={{ animationDelay: `${(nameDelayBase + i * 0.06).toFixed(2)}s` } as CSSProperties}>
                {ch}
              </span>
            ),
          )}
        </div>
        {/* The party row the operator asked for by name: cake, and friends. */}
        <div style={{ fontSize: Math.round(104 * unit), marginTop: Math.round(20 * unit), lineHeight: 1, display: "flex", gap: Math.round(36 * unit) }} aria-hidden>
          {["🎈", "🎂", "🎁", "🎉"].map((e, i) => (
            <span key={i} className="bday-bob" style={{ animationDelay: `${i * 0.35}s` }}>
              {e}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
