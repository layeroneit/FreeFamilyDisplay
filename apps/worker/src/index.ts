/**
 * Worker entrypoint.
 *
 * Runs the scheduled jobs (weather today; connectors in Phase 2) and answers
 * health probes. Plain intervals for now — BullMQ arrives with the first job
 * that genuinely needs a durable queue (wallpaper rotation, plan §6.6.0).
 *
 * The reason this service exists at all, from day one: plan §4.2 forbids `web`
 * from making outbound third-party calls during a request. That rule needs
 * somewhere for the work to go, and retrofitting a worker after routes have
 * grown their own `fetch()` calls is how you end up with a 120-second request
 * handler.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isDatabaseReachable } from "@ffd/db";
import { createLogger } from "@ffd/log";
// Named import, not default: ioredis is CJS, and under NodeNext the default
// import resolves to the module namespace, which is not constructable.
import { Redis } from "ioredis";
import { runWeatherCycle, startWeatherLoop } from "./weather.js";

const log = createLogger("worker");

function healthPort(): number {
  const raw = process.env.WORKER_HEALTH_PORT;
  if (raw === undefined || raw === "") return 3002;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    // `Number("")` is 0 and would silently bind an ephemeral port, leaving the
    // container healthcheck probing 3002 forever. Fail loudly instead.
    throw new Error(`WORKER_HEALTH_PORT must be a port number, got "${raw}"`);
  }
  return n;
}

const HEALTH_PORT = healthPort();

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is not set. See .env.example.");
    redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      // The queue is not user-facing; failing fast and letting the health probe
      // report it beats blocking a shutdown on reconnect attempts.
      enableOfflineQueue: false,
    });
    // Without a listener, a connection error becomes an unhandled 'error' event
    // and takes the process down. Redis being briefly unreachable is a
    // readiness problem, not a crash. ioredis retries every ~2s forever, so
    // log at most once a minute rather than flooding stdout for the whole
    // duration of an outage.
    let lastErrorLogAt = 0;
    redis.on("error", (err: Error) => {
      const now = Date.now();
      if (now - lastErrorLogAt >= 60_000) {
        lastErrorLogAt = now;
        log.warn("redis connection error", { error: err.message });
      }
    });
  }
  return redis;
}

// Memoized in-flight connect: two probes arriving together must not both call
// connect() — the second rejects with "already connecting" and would report a
// healthy Redis as down.
let connecting: Promise<void> | null = null;

async function isRedisReachable(): Promise<boolean> {
  try {
    const client = getRedis();
    if (client.status === "wait" || client.status === "end") {
      connecting ??= client.connect().finally(() => {
        connecting = null;
      });
    }
    if (connecting) await connecting;
    return (await client.ping()) === "PONG";
  } catch {
    return false;
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? "/").split("?")[0];

  if (path === "/healthz") {
    // Liveness only. Answers as long as the event loop is turning; it must not
    // depend on Postgres or Redis, or a database blip restarts a healthy worker.
    send(res, 200, { status: "ok" });
    return;
  }

  if (path === "/readyz") {
    const [database, queue] = await Promise.all([isDatabaseReachable(), isRedisReachable()]);
    const ready = database && queue;
    send(res, ready ? 200 : 503, { status: ready ? "ready" : "not-ready", database, queue });
    return;
  }

  if (path === "/jobs/weather" && req.method === "POST") {
    // Internal-network trigger: `web` pokes this when a weather widget is
    // created or its town changes, so the first forecast lands in seconds
    // rather than on the next 15-minute tick. Joins an in-flight cycle rather
    // than stacking a new one; not reachable from the LAN (no published port).
    void runWeatherCycle();
    send(res, 202, { status: "started" });
    return;
  }

  send(res, 404, { error: "not found" });
}

const server = createServer((req, res) => {
  void handle(req, res).catch((err: unknown) => {
    // The message is logged, never sent. A driver error can carry a connection
    // string, and a connection string carries a password.
    log.error("health handler failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    send(res, 500, { error: "internal error" });
  });
});

const stopWeather = startWeatherLoop();

server.listen(HEALTH_PORT, () => {
  log.info("worker started", { port: HEALTH_PORT, jobs: "weather" });
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutting down", { signal });

  // Let an in-flight probe finish (a /readyz against a slow Postgres can take
  // seconds), but never hang the container past Docker's stop grace period.
  const deadline = setTimeout(() => process.exit(1), 5_000);
  deadline.unref();

  stopWeather();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (redis) {
    try {
      await redis.quit();
    } catch {
      // quit() rejects when the connection never came up — and does not stop
      // the reconnect loop. disconnect() does.
      redis.disconnect();
    }
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
