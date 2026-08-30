/**
 * Weather-reactive ambiance (plan §7.7.5). Pure mapping from current
 * conditions to a mood layer description; the renderer draws it.
 *
 * Tier 1 (every display): a static tint + brightness shift. Tier 2 (capable
 * displays, opt-in): particles — rain, snow, drifting fog, a rare lightning
 * flash. Never a continuous loop on the Pi; the kiosk degrades to Tier 1 there.
 */

export type ConditionClass = "clear" | "partly" | "overcast" | "fog" | "rain" | "snow" | "storm";

export function conditionClass(code: number): ConditionClass {
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "overcast";
}

export type Mood = {
  condition: ConditionClass;
  isDay: boolean;
  /** CSS gradient painted over the board at `tintOpacity`. */
  tint: string;
  /** 0–1 at full strength; scaled by the board's strength setting. */
  tintOpacity: number;
  /** CSS filter applied to the canvas (brightness/saturation). */
  filter: string;
  particles: "rain" | "snow" | "fog" | "storm" | null;
  label: string;
};

export function moodFor(code: number, isDay: boolean, strengthPct: number): Mood {
  const s = Math.max(0, Math.min(100, strengthPct)) / 100;
  const c = conditionClass(code);
  const base: Record<ConditionClass, Omit<Mood, "condition" | "isDay">> = {
    clear: isDay
      ? { tint: "radial-gradient(ellipse 70% 55% at 85% 0%, rgb(255 205 120 / 0.9), transparent 60%)", tintOpacity: 0.55, filter: "brightness(1.05) saturate(1.1)", particles: null, label: "Sunny" }
      : { tint: "radial-gradient(ellipse 60% 50% at 80% 0%, rgb(120 150 255 / 0.5), transparent 60%)", tintOpacity: 0.35, filter: "brightness(0.9)", particles: null, label: "Clear night" },
    partly: { tint: "linear-gradient(180deg, rgb(255 225 170 / 0.5), transparent 55%)", tintOpacity: 0.35, filter: "brightness(1.02)", particles: null, label: "Partly cloudy" },
    overcast: { tint: "linear-gradient(180deg, rgb(120 130 150 / 0.7), rgb(90 95 110 / 0.4))", tintOpacity: 0.45, filter: "brightness(0.9) saturate(0.85)", particles: null, label: "Overcast" },
    fog: { tint: "linear-gradient(180deg, rgb(200 205 215 / 0.8), rgb(160 165 175 / 0.6))", tintOpacity: 0.5, filter: "brightness(0.95) saturate(0.7)", particles: "fog", label: "Foggy" },
    rain: { tint: "linear-gradient(180deg, rgb(40 55 80 / 0.85), rgb(20 30 50 / 0.7))", tintOpacity: 0.6, filter: "brightness(0.78) saturate(0.85)", particles: "rain", label: "Raining" },
    snow: { tint: "linear-gradient(180deg, rgb(210 225 245 / 0.7), rgb(170 190 220 / 0.5))", tintOpacity: 0.5, filter: "brightness(1.0) saturate(0.8)", particles: "snow", label: "Snowing" },
    storm: { tint: "linear-gradient(180deg, rgb(15 20 35 / 0.9), rgb(10 12 25 / 0.85))", tintOpacity: 0.7, filter: "brightness(0.65) saturate(0.8)", particles: "storm", label: "Storm" },
  };
  const m = base[c];
  return { condition: c, isDay, ...m, tintOpacity: +(m.tintOpacity * s).toFixed(3) };
}
