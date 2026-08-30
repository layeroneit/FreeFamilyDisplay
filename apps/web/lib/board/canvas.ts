/**
 * Fixed canvases (plan §7.1, amended 2026-08-30 at the operator's request).
 *
 * Still no responsive reflow: a board is laid out on exactly one of these
 * pixel canvases and the kiosk scales it with a single transform. Adding a
 * preset here is the only way a new screen shape enters the system.
 */

export const CANVAS_PRESETS = {
  LANDSCAPE: { w: 1920, h: 1080, label: "Landscape", hint: "TVs, monitors, tablets on their side" },
  PORTRAIT: { w: 1080, h: 1920, label: "Portrait", hint: "A tablet or monitor stood upright" },
  ULTRAWIDE: { w: 2560, h: 1080, label: "Ultrawide", hint: "21:9 monitors" },
} as const;

export type CanvasPreset = keyof typeof CANVAS_PRESETS;
export const CANVAS_PRESET_IDS = Object.keys(CANVAS_PRESETS) as CanvasPreset[];

export function isCanvasPreset(v: string): v is CanvasPreset {
  return v in CANVAS_PRESETS;
}

export function canvasSize(preset: CanvasPreset): { w: number; h: number } {
  const p = CANVAS_PRESETS[preset];
  return { w: p.w, h: p.h };
}
