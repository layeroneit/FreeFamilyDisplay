import type { WallpaperInfo } from "@/lib/board/wallpapers";
import type { Mood } from "@/lib/board/mood";
import { MoodParticles } from "./mood-particles";

/**
 * The four compositing layers behind the widgets (spec §2), back to front:
 * wallpaper → scrim → (weather mood tint + particles) → widgets sit above.
 * All absolutely positioned inside the canvas so the single scale transform
 * carries them.
 */
export function BoardBackdrop({
  wallpaper,
  scrimOpacity,
  mood,
  canvasW,
  effects,
}: {
  wallpaper: WallpaperInfo | null;
  scrimOpacity: number;
  mood: Mood | null;
  canvasW: number;
  effects: boolean;
}) {
  return (
    <>
      {wallpaper ? (
        <>
          <img
            data-part="wallpaper"
            src={`${wallpaper.basePath}-${canvasW > 1920 ? 2560 : 1920}.webp`}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              // LQIP underneath so the board is never blank while the asset loads.
              background: `center / cover no-repeat url(${wallpaper.lqip})`,
              filter: mood?.filter,
            }}
            draggable={false}
          />
          <div data-part="scrim" style={{ position: "absolute", inset: 0, background: "#000", opacity: scrimOpacity }} />
          <p
            data-part="credit"
            style={{
              position: "absolute",
              right: 16,
              bottom: 10,
              fontSize: 14,
              color: "rgb(255 255 255 / 0.65)",
              textShadow: "0 1px 3px rgb(0 0 0 / 0.6)",
              zIndex: 5,
              margin: 0,
            }}
          >
            {wallpaper.attribution.photographer} · {wallpaper.attribution.source} · {wallpaper.attribution.license}
          </p>
        </>
      ) : null}
      {mood ? (
        <>
          <div data-part="mood-tint" style={{ position: "absolute", inset: 0, background: mood.tint, opacity: mood.tintOpacity, pointerEvents: "none" }} />
          {effects && mood.particles ? <MoodParticles kind={mood.particles} /> : null}
        </>
      ) : null}
    </>
  );
}
