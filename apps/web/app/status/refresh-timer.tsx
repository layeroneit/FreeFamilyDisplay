"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-fetches the server component on an interval. Admin/preview surfaces only —
 * the kiosk renderer (Phase 4) swaps widget subtrees instead (§7.8).
 *
 * A refresh HOLDS while a celebration is on stage (the data-celebrating flag
 * on <html>, set by gameday-celebration): the re-render's reconcile read as a
 * mid-party freeze on the Pi. The timer ticks every 15s but refreshes only
 * once the interval has genuinely elapsed AND the stage is clear, so a
 * three-minute celebration delays the refresh, never skips a whole cycle.
 */
export function RefreshTimer({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const id = setInterval(() => {
      if (Date.now() - last < intervalMs) return;
      // Hold for the stage — but never forever: past 3x the interval,
      // refresh anyway. A wall display that stops updating because a flag
      // stuck is this project's worst failure class, and the insurance
      // costs one comparison.
      if (document.documentElement.hasAttribute("data-celebrating") && Date.now() - last < intervalMs * 3) return;
      last = Date.now();
      router.refresh();
    }, 15_000);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
