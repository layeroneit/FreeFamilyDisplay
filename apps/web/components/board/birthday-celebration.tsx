"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { birthdayGreeting, isCelebrationHour } from "@/lib/board/birthdays";

/** Party colours. Fixed, not the theme accents — a birthday looks the same on
 *  every board, and one-colour confetti doesn't read as confetti. */
const CONFETTI = ["#F43F5E", "#FB923C", "#FACC15", "#4ADE80", "#38BDF8", "#A78BFA", "#F472B6", "#FFFFFF"];
const PIECES = 110;

type Flake = { x: number; w: number; h: number; color: string; dur: number; delay: number; drift: number; spin: number; round: boolean };

/**
 * Full-screen birthday celebration: confetti pours down the whole board and
 * the name lands in the middle, then everything fades and the board comes
 * back. Fires on the hour through waking hours (see isCelebrationHour), for
 * whoever the calendar says has a birthday today.
 *
 * The schedule deliberately does NOT depend on `names`. The kiosk re-fetches
 * its server components every five minutes, which hands this component a new
 * array each time; an effect keyed on it would restart the timer every five
 * minutes and a top-of-the-hour timeout would never come due. The names are
 * read through a ref at fire time instead, so a refresh mid-celebration is
 * invisible and a birthday that appears at midnight is picked up by the next
 * hourly fire without a reload.
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
  // Written in an effect, not during render: the timer below is the only
  // reader and it always runs after paint.
  useEffect(() => {
    namesRef.current = names;
  });

  useEffect(() => {
    // Exactly three live timers at any moment — the next hourly fire, and
    // while a celebration is playing its fade and its teardown. A wall
    // display runs for months, so nothing here may accumulate.
    let hourly: ReturnType<typeof setTimeout> | undefined;
    let fade: ReturnType<typeof setTimeout> | undefined;
    let end: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      const now = new Date();
      // The next LOCAL top of the hour. Not "now + 3600s − now%3600s", which
      // is only the same thing in whole-hour time zones.
      const next = new Date(now);
      next.setMinutes(0, 0, 0);
      next.setHours(next.getHours() + 1);
      hourly = setTimeout(
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
      clearTimeout(hourly);
      clearTimeout(fade);
      clearTimeout(end);
    };
  }, [durationSec]);

  // Deterministic so the confetti is identical every play and there is no
  // server/client mismatch to reconcile.
  const flakes = useMemo<Flake[]>(() => {
    let s = 0x5eed;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    return Array.from({ length: PIECES }, () => ({
      x: r() * 100,
      w: 9 + r() * 11,
      h: 13 + r() * 18,
      color: CONFETTI[Math.floor(r() * CONFETTI.length)]!,
      dur: +(4.6 + r() * 4.2).toFixed(2),
      delay: +(r() * Math.max(0, durationSec - 8)).toFixed(2),
      drift: Math.round((r() - 0.5) * 200),
      spin: Math.round(360 + r() * 1080) * (r() < 0.5 ? -1 : 1),
      round: r() < 0.22,
    }));
  }, [durationSec]);

  if (phase === "idle" || names.length === 0) return null;

  const greeting = birthdayGreeting(names);
  const unit = canvasW / 1920;
  // Shrink to fit rather than run off the edge: display faces average about
  // 0.56em per character, and the name gets 86% of the board's width.
  const nameSize = Math.max(48, Math.min(190 * unit, (canvasW * 0.86) / (Math.max(4, greeting.length) * 0.56)));

  return (
    <div
      data-part="birthday"
      className={phase === "leaving" ? "bday-overlay bday-out" : "bday-overlay"}
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 900 }}
    >
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, rgb(0 0 0 / 0.5), rgb(0 0 0 / 0.8))" }} />
      {flakes.map((f, i) => (
        <span
          key={i}
          className="bday-flake"
          style={
            {
              position: "absolute",
              left: `${f.x}%`,
              top: -40,
              width: f.w,
              height: f.round ? f.w : f.h,
              borderRadius: f.round ? "50%" : 2,
              background: f.color,
              animationDuration: `${f.dur}s`,
              animationDelay: `${f.delay}s`,
              "--bday-fall": `${canvasH + 120}px`,
              "--bday-drift": `${f.drift}px`,
              "--bday-spin": `${f.spin}deg`,
            } as CSSProperties
          }
        />
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
        <div className="bday-pop" style={{ fontSize: Math.round(88 * unit), fontWeight: 600, lineHeight: 1.05, letterSpacing: 2 }}>
          Happy Birthday
        </div>
        <div
          className="bday-pop bday-pop-2"
          style={{
            fontSize: Math.round(nameSize),
            fontWeight: 700,
            lineHeight: 1.02,
            marginTop: Math.round(12 * unit),
            color: "var(--hearth-accent-1)",
            overflowWrap: "break-word",
            maxWidth: "100%",
          }}
        >
          {greeting}
        </div>
        <div className="bday-pop bday-pop-3" style={{ fontSize: Math.round(96 * unit), marginTop: Math.round(16 * unit), lineHeight: 1 }} aria-hidden>
          🎂
        </div>
      </div>
    </div>
  );
}
