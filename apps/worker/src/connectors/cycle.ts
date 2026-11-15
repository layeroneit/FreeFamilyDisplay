/**
 * Single-flight runner for the connector cycle. A call while a cycle is in
 * flight joins it, as before, but also asks for one more cycle once it ends:
 * a link saved while the cycle is busy with photos has already missed
 * syncCalendars, and would otherwise wait for the next 15-minute tick.
 * Any number of calls during one cycle coalesce into a single rerun.
 */
export function coalescingRunner(task: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  let rerunRequested = false;
  return () => {
    if (inFlight) {
      rerunRequested = true;
      return inFlight;
    }
    inFlight = (async () => {
      do {
        rerunRequested = false;
        await task();
      } while (rerunRequested);
    })().finally(() => {
      inFlight = null;
      rerunRequested = false;
    });
    return inFlight;
  };
}
