import "server-only";
import { createLogger } from "@ffd/log";

const log = createLogger("web.worker-poke");

/**
 * Asks the worker to run its weather cycle now. Internal service call on the
 * compose network — not a third-party fetch, so plan §4.2 holds. Fire and
 * forget with a short timeout: a slow or absent worker must never slow a
 * request; the 15-minute schedule is the fallback.
 */
export function pokeWorkerWeather(): void {
  const base = process.env.WORKER_URL ?? "http://worker:3002";
  fetch(`${base}/jobs/weather`, { method: "POST", signal: AbortSignal.timeout(2000), cache: "no-store" }).catch(
    (err: unknown) => {
      log.warn("weather poke failed (schedule will pick it up)", {
        error: err instanceof Error ? err.message : "unknown",
      });
    },
  );
}

/** Asks the worker to sync calendar/photo links now. Same rules as the weather poke. */
export function pokeWorkerConnectors(): void {
  const base = process.env.WORKER_URL ?? "http://worker:3002";
  fetch(`${base}/jobs/connectors`, { method: "POST", signal: AbortSignal.timeout(2000), cache: "no-store" }).catch(
    (err: unknown) => {
      log.warn("connector poke failed (schedule will pick it up)", { error: err instanceof Error ? err.message : "unknown" });
    },
  );
}
