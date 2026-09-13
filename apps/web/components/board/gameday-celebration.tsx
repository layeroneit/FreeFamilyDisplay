"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { isCelebrationHour } from "@/lib/board/birthdays";
import { hypeForSlot, isKickoffSlot, type HypeLine } from "@/lib/board/nfl";

/**
 * The game-day party, the operator's pick B1: the birthday celebration's DNA
 * in team colors. Every half hour through waking hours a hype line pops in
 * letter by letter over a confetti downpour, with the emoji row bobbing under
 * it; the slot nearest kickoff gets a longer blowout and shouts KICKOFF.
 *
 * Everything structural is inherited from BirthdayCelebration and its
 * hard-won rules: the half-hour boundary is computed from the local clock
 * (never now-plus-milliseconds, which drifts across DST); props are read
 * through REFS at fire time, because the kiosk re-fetches server components
 * every five minutes and an effect keyed on fresh arrays would restart the
 * timer forever; and the confetti splits descent and tumble across two
 * elements, the one arrangement the operator's Pi provably renders
 * top-to-bottom. It also shares the bday-* keyframes in globals.css.
 *
 * Never mounted on a birthday — the pages hold that rule: a household member
 * outranks the team, even on game day.
 */

const PIECES = 110;

type Flake = { x: number; w: number; h: number; color: string; dur: number; delay: number; drift: number; tumble: number; round: boolean };

export function GameDayCelebration({
  nickname,
  emoji,
  accent,
  accent2,
  lines,
  kickoffIso,
  canvasW,
  canvasH,
}: {
  nickname: string;
  emoji: string;
  accent: string;
  accent2: string;
  lines: HypeLine[];
  kickoffIso: string;
  canvasW: number;
  canvasH: number;
}) {
  const [show, setShow] = useState<{ line: HypeLine; durationSec: number; phase: "playing" | "leaving" } | null>(null);
  const linesRef = useRef(lines);
  const kickoffRef = useRef(kickoffIso);
  const nickRef = useRef(nickname);
  useEffect(() => {
    linesRef.current = lines;
    kickoffRef.current = kickoffIso;
    nickRef.current = nickname;
  });

  useEffect(() => {
    let boundary: ReturnType<typeof setTimeout> | undefined;
    let fade: ReturnType<typeof setTimeout> | undefined;
    let end: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      const now = new Date();
      const next = new Date(now);
      next.setSeconds(0, 0);
      next.setMinutes(now.getMinutes() < 30 ? 30 : 60);
      boundary = setTimeout(
        () => {
          const at = new Date();
          if (isCelebrationHour(at.getHours())) {
            const kickoff = isKickoffSlot(new Date(kickoffRef.current), at);
            const line: HypeLine = kickoff
              ? { top: "KICKOFF!", sub: `GO ${nickRef.current.toUpperCase()}!` }
              : hypeForSlot(linesRef.current, at);
            const durationSec = kickoff ? 32 : 20;
            setShow({ line, durationSec, phase: "playing" });
            clearTimeout(fade);
            clearTimeout(end);
            fade = setTimeout(() => setShow((s) => (s ? { ...s, phase: "leaving" } : s)), Math.max(1000, (durationSec - 1.4) * 1000));
            end = setTimeout(() => setShow(null), durationSec * 1000);
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
  }, []);

  // Team confetti: the two team colors and white. Deterministic, so the pour
  // is identical every play and hydration never has anything to reconcile.
  const flakes = useMemo<Flake[]>(() => {
    const colors = [accent, accent2, "#FFFFFF"];
    let s = 0x600d;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    return Array.from({ length: PIECES }, () => ({
      x: r() * 100,
      w: 9 + r() * 11,
      h: 13 + r() * 18,
      color: colors[Math.floor(r() * colors.length)]!,
      dur: +(4.6 + r() * 4.2).toFixed(2),
      delay: +(r() * 4).toFixed(2),
      drift: Math.round((r() - 0.5) * 200),
      tumble: +(0.9 + r() * 1.6).toFixed(2),
      round: r() < 0.22,
    }));
  }, [accent, accent2]);

  if (!show) return null;

  const unit = canvasW / 1920;
  const top = show.line.top.toUpperCase();
  const sub = show.line.sub?.toUpperCase();
  const topSize = Math.max(48, Math.min(190 * unit, (canvasW * 0.86) / (Math.max(4, top.length) * 0.56)));
  const letterColors = [accent, "#FFFFFF", accent2];
  const subDelayBase = top.length * 0.07 + 0.25;

  return (
    <div
      data-part="gameday"
      className={show.phase === "leaving" ? "bday-overlay bday-out" : "bday-overlay"}
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 900 }}
    >
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, rgb(0 0 0 / 0.5), rgb(0 0 0 / 0.8))" }} />

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
        <div
          style={{ fontSize: Math.round(topSize), fontStyle: "italic", fontWeight: 800, lineHeight: 1.05, letterSpacing: 3, whiteSpace: "nowrap" }}
          aria-label={top}
        >
          {top.split("").map((ch, i) =>
            ch === " " ? (
              <span key={i}>&nbsp;&nbsp;</span>
            ) : (
              <span
                key={i}
                className="bday-letter"
                style={{ color: letterColors[i % letterColors.length], animationDelay: `${(i * 0.07).toFixed(2)}s`, "--tilt": `${i % 2 ? 4 : -4}deg` } as CSSProperties}
              >
                {ch}
              </span>
            ),
          )}
        </div>
        {sub ? (
          <div
            style={{ fontSize: Math.round(Math.max(40, topSize * 0.42)), fontWeight: 800, lineHeight: 1.05, marginTop: Math.round(16 * unit), letterSpacing: 4 }}
            aria-label={sub}
          >
            {sub.split("").map((ch, i) =>
              ch === " " ? (
                <span key={i}>&nbsp;</span>
              ) : (
                <span key={i} className="bday-letter" style={{ animationDelay: `${(subDelayBase + i * 0.06).toFixed(2)}s` } as CSSProperties}>
                  {ch}
                </span>
              ),
            )}
          </div>
        ) : null}
        <div style={{ fontSize: Math.round(104 * unit), marginTop: Math.round(22 * unit), lineHeight: 1, display: "flex", gap: Math.round(36 * unit) }} aria-hidden>
          {["🏈", emoji, "💪", "🎉"].map((e, i) => (
            <span key={i} className="bday-bob" style={{ animationDelay: `${i * 0.35}s` }}>
              {e}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
