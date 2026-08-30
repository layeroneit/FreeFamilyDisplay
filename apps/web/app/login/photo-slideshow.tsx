"use client";

import { useEffect, useState } from "react";

export type SlidePhoto = {
  src: string;
  srcSet: string;
  photographer: string;
  source: string;
  /** Source capped below 1600px — never stretch it past native size. */
  lowRes: boolean;
  nativeW: number;
};

const INTERVAL_MS = 7_000;
const FADE_MS = 1_200;

/**
 * Crossfading slideshow for the login rail. Admin surface, so a gentle timer
 * is fine here — the kiosk renderer never runs loops like this (§7.8).
 *
 * Reduced-motion users get a single photo with no transitions. The next image
 * is preloaded before it's shown so the fade never reveals a blank panel.
 * `srcset` + `sizes` let a 4K or ultrawide screen pull the 2560 copy.
 */
export function PhotoSlideshow({ photos, startIndex }: { photos: SlidePhoto[]; startIndex: number }) {
  const [index, setIndex] = useState(startIndex % Math.max(photos.length, 1));
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced || photos.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % photos.length), INTERVAL_MS);
    return () => clearInterval(id);
  }, [reduced, photos.length]);

  useEffect(() => {
    if (photos.length < 2) return;
    const next = photos[(index + 1) % photos.length];
    if (!next) return;
    const img = new Image();
    img.srcset = next.srcSet;
    img.sizes = "50vw";
    img.src = next.src;
  }, [index, photos]);

  if (photos.length === 0) return null;
  const current = photos[index % photos.length];

  return (
    <>
      {photos.map((p, i) => (
        <img
          key={p.src}
          src={p.src}
          srcSet={p.srcSet}
          sizes="50vw"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            opacity: i === index ? 1 : 0,
            transition: reduced ? "none" : `opacity ${FADE_MS}ms ease-in-out`,
            // A 1024px source shown at 50vw on a 4K screen: keep it honest
            // (contain within its native width) rather than smearing pixels.
            ...(p.lowRes ? { objectFit: "cover", imageRendering: "auto" as const, filter: "saturate(1.05)" } : {}),
          }}
          loading={i === index ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 h-24" style={{ background: "linear-gradient(transparent, rgb(0 0 0 / 0.55))" }} />
      <p className="absolute bottom-3 left-4 text-xs text-white/80" aria-live="off">
        Photo: {current?.photographer} · {current?.source}
      </p>
    </>
  );
}
