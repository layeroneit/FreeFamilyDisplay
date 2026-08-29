import assert from "node:assert/strict";
import test from "node:test";
import { createLogger } from "./index.ts";

type Captured = { out: string[]; err: string[]; restore: () => void };

function capture(): Captured {
  const out: string[] = [];
  const err: string[] = [];
  const realOut = process.stdout.write.bind(process.stdout);
  const realErr = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((chunk: string) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => {
    err.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  return {
    out,
    err,
    restore: () => {
      process.stdout.write = realOut;
      process.stderr.write = realErr;
    },
  };
}

test("emits one JSON object per line with the expected envelope", () => {
  const cap = capture();
  try {
    process.env.LOG_LEVEL = "debug";
    createLogger("worker").info("fetched feed", { connectionId: "abc123", events: 42 });
  } finally {
    cap.restore();
  }

  assert.equal(cap.out.length, 1);
  assert.ok(cap.out[0]?.endsWith("\n"), "line should be newline-terminated");

  const parsed: unknown = JSON.parse(cap.out[0] ?? "");
  assert.ok(typeof parsed === "object" && parsed !== null);

  const line = parsed as Record<string, unknown>;
  assert.equal(line["level"], "info");
  assert.equal(line["service"], "worker");
  assert.equal(line["msg"], "fetched feed");
  assert.equal(line["connectionId"], "abc123");
  assert.equal(line["events"], 42);
  assert.equal(typeof line["ts"], "string");
});

test("warn and error go to stderr, info and debug to stdout", () => {
  const cap = capture();
  try {
    process.env.LOG_LEVEL = "debug";
    const log = createLogger("web");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
  } finally {
    cap.restore();
  }

  assert.equal(cap.out.length, 2);
  assert.equal(cap.err.length, 2);
});

test("respects LOG_LEVEL", () => {
  const cap = capture();
  try {
    process.env.LOG_LEVEL = "warn";
    const log = createLogger("web");
    log.debug("dropped");
    log.info("dropped");
    log.warn("kept");
  } finally {
    cap.restore();
  }

  assert.equal(cap.out.length, 0);
  assert.equal(cap.err.length, 1);
});

test("child loggers namespace the service", () => {
  const cap = capture();
  try {
    process.env.LOG_LEVEL = "debug";
    createLogger("worker").child("ics").info("parsed");
  } finally {
    cap.restore();
  }

  const line = JSON.parse(cap.out[0] ?? "") as Record<string, unknown>;
  assert.equal(line["service"], "worker.ics");
});

test("a field value containing a newline cannot forge a second log line", () => {
  // Log fields are attacker-influenced downstream (ICS titles, RSS content,
  // plan §"Untrusted input"). JSON.stringify escapes the newline, so a crafted
  // value produces one line, not two.
  const cap = capture();
  try {
    process.env.LOG_LEVEL = "debug";
    createLogger("worker").info("event", {
      title: 'evil\n{"level":"info","msg":"forged"}',
    });
  } finally {
    cap.restore();
  }

  assert.equal(cap.out.length, 1);
  assert.equal((cap.out[0]?.match(/\n/g) ?? []).length, 1);
});
