import assert from "node:assert/strict";
import test from "node:test";
import { coalescingRunner } from "./cycle.ts";

test("a poke during a running cycle gets one more cycle afterwards (L4)", async () => {
  let runs = 0;
  let release: (() => void) | null = null;
  const run = coalescingRunner(async () => {
    runs++;
    if (runs === 1) await new Promise<void>((r) => (release = r));
  });
  const first = run();
  // The user saves a link while the first cycle is still busy: several pokes coalesce into one rerun.
  const second = run();
  const third = run();
  release!();
  await Promise.all([first, second, third]);
  assert.equal(runs, 2);
  // Idle again: a new poke starts a fresh cycle.
  await run();
  assert.equal(runs, 3);
});

test("a failing cycle does not wedge the runner", async () => {
  let runs = 0;
  const run = coalescingRunner(async () => {
    runs++;
    if (runs === 1) throw new Error("boom");
  });
  await run().catch(() => undefined);
  await run();
  assert.equal(runs, 2);
});
