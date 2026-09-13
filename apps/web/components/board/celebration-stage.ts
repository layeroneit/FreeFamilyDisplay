"use client";

import { useEffect } from "react";

/**
 * While any full-screen celebration plays, the board yields the stage: a
 * document-level flag that globals.css uses to pause every ambient animation
 * (rain, Ken Burns, the football sky, the seasonal fall) and refresh-timer
 * uses to hold the 5-minute re-fetch, whose mid-show reconcile read as a
 * freeze on the Pi. Document-level because those layers are server-rendered
 * siblings the celebrations cannot reach through props. The two celebration
 * components are mutually exclusive at every call site, so a plain
 * set/remove needs no refcount.
 */
export function useCelebrationStage(playing: boolean): void {
  useEffect(() => {
    if (!playing) return;
    document.documentElement.setAttribute("data-celebrating", "true");
    return () => document.documentElement.removeAttribute("data-celebrating");
  }, [playing]);
}
