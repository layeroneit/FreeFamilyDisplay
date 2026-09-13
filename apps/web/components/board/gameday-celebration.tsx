"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { isCelebrationHour } from "@/lib/board/birthdays";
import { useCelebrationStage } from "./celebration-stage";
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

/**
 * 40, down from the birthday's 110 in two steps: on the wall the dense fast
 * confetti stuttered while the dozen lazy footballs sailed ("glitchy, not
 * smooth" — operator, 2026-09-13). Fewer pieces is less paint per frame,
 * slow motion hides the frames a Pi drops, and at 1080p the eye cannot
 * count the difference between 60 flakes and 40; the birthday keeps its
 * 20-second downpour, but a three-minute dwell wants weather, not a
 * blizzard. The second lever is below: while the party plays, the REST of
 * the board's animations pause, handing the whole compositor budget to the
 * celebration — which is how the ambient layers earn their smoothness.
 */
const PIECES = 40;
/** The ?effects=low kiosk path: same party, a fraction of the paint. (16
 *  against the default's 40 — the audit noted 32 vs 40 had stopped being a
 *  meaningful saving on the hardware that needs it.) */
const PIECES_LOW = 16;

type Flake = { x: number; w: number; h: number; color: string; dur: number; delay: number; drift: number; tumble: number; round: boolean };

/**
 * A hype line that WRAPS: words are unbreakable, spaces are honest break
 * points, letters still pop in one by one across the whole phrase. The first
 * cut sized the font from the full phrase length and set nowrap — on a
 * portrait wall "MONSTERS OF THE MIDWAY" walked off both edges (operator,
 * 2026-09-13). Sizing now answers to the longest WORD; the phrase takes the
 * lines it needs.
 */
export function PopLine({
  text,
  fontSize,
  colors,
  baseDelay,
  tilt,
  italic,
  letterSpacing,
}: {
  text: string;
  fontSize: number;
  /** Per-letter color cycle, or null to inherit. */
  colors: string[] | null;
  baseDelay: number;
  tilt: boolean;
  italic: boolean;
  letterSpacing: number;
}) {
  let idx = 0;
  return (
    <div style={{ fontSize, fontStyle: italic ? "italic" : undefined, fontWeight: 800, lineHeight: 1.08, letterSpacing, maxWidth: "100%" }} aria-label={text}>
      {text.split(" ").map((word, wi) => (
        <span key={wi}>
          {wi > 0 ? " " : null}
          {/* inline-block without nowrap: shrink-to-fit keeps a fitting word
              on one line, and a word wider than the container (a chant in a
              wide display face) degrades to an in-word break instead of
              walking off the edge under the overlay's overflow clip. */}
          <span style={{ display: "inline-block" }}>
            {word.split("").map((ch) => {
              const i = idx++;
              return (
                <span
                  key={i}
                  className="bday-letter"
                  style={
                    {
                      ...(colors ? { color: colors[i % colors.length] } : null),
                      animationDelay: `${(baseDelay + i * 0.07).toFixed(2)}s`,
                      ...(tilt ? { "--tilt": `${i % 2 ? 4 : -4}deg` } : null),
                    } as CSSProperties
                  }
                >
                  {ch}
                </span>
              );
            })}
          </span>
        </span>
      ))}
    </div>
  );
}

export function GameDayCelebration({
  nickname,
  emoji,
  accent,
  accent2,
  lines,
  kickoffIso,
  canvasW,
  canvasH,
  reduceEffects = false,
  artUrl = null,
}: {
  nickname: string;
  emoji: string;
  accent: string;
  accent2: string;
  lines: HypeLine[];
  kickoffIso: string;
  canvasW: number;
  canvasH: number;
  /** Low-power kiosk path: fewer confetti pieces, everything else intact. */
  reduceEffects?: boolean;
  /** The household's own team art (operator-placed; see gameday-frame). */
  artUrl?: string | null;
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
            // Minutes, not a flash — the operator watched the 20-second cut
            // vanish before anyone could call the kids over (2026-09-13).
            // Confetti and the emoji row loop, so the scene stays alive for
            // the whole dwell.
            const durationSec = kickoff ? 300 : 180;
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

  // The board yields the stage while the party plays (see celebration-stage).
  useCelebrationStage(show !== null);

  // Team confetti: the two team colors and white. Deterministic, so the pour
  // is identical every play and hydration never has anything to reconcile.
  const flakes = useMemo<Flake[]>(() => {
    const colors = [accent, accent2, "#FFFFFF"];
    let s = 0x600d;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    return Array.from({ length: reduceEffects ? PIECES_LOW : PIECES }, () => ({
      x: r() * 100,
      w: 9 + r() * 11,
      h: 13 + r() * 18,
      color: colors[Math.floor(r() * colors.length)]!,
      dur: +(7 + r() * 5).toFixed(2),
      delay: +(r() * 4).toFixed(2),
      drift: Math.round((r() - 0.5) * 200),
      tumble: +(1.8 + r() * 1.8).toFixed(2),
      round: r() < 0.22,
    }));
  }, [accent, accent2, reduceEffects]);

  if (!show) return null;

  const unit = canvasW / 1920;
  const top = show.line.top.toUpperCase();
  const sub = show.line.sub?.toUpperCase();
  // The longest word is the width constraint now that the line wraps; 0.68
  // per glyph because a chant is all caps and heavy on the wide letters.
  const longestWord = Math.max(4, ...top.split(" ").map((w) => w.length));
  const topSize = Math.max(44, Math.min(190 * unit, (canvasW * 0.9) / (longestWord * 0.68)));
  const subSize = Math.round(Math.max(34, topSize * 0.42));
  const letterColors = [accent, "#FFFFFF", accent2];
  const subDelayBase = top.replace(/ /g, "").length * 0.07 + 0.25;

  return (
    <div
      data-part="gameday"
      className={show.phase === "leaving" ? "bday-overlay bday-out" : "bday-overlay"}
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 900, contain: "layout style paint" }}
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
        {artUrl ? (
          <img
            src={artUrl}
            alt=""
            draggable={false}
            className="bday-bob"
            style={{
              height: Math.round(Math.min(canvasH * 0.24, 300 * unit)),
              maxWidth: "60%",
              objectFit: "contain",
              marginBottom: Math.round(18 * unit),
              filter: "drop-shadow(0 6px 28px rgb(0 0 0 / 0.6))",
            }}
          />
        ) : null}
        <PopLine text={top} fontSize={Math.round(topSize)} colors={letterColors} baseDelay={0} tilt italic letterSpacing={3} />
        {sub ? (
          <div style={{ marginTop: Math.round(16 * unit) }}>
            <PopLine text={sub} fontSize={subSize} colors={null} baseDelay={subDelayBase} tilt={false} italic={false} letterSpacing={4} />
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
