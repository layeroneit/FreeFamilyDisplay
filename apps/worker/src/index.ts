/**
 * Worker entrypoint.
 *
 * Phase 0 is deliberately empty of jobs. This process exists, connects to its
 * dependencies, answers health probes, and shuts down cleanly. The BullMQ
 * scheduler and connector fetching arrive in Phase 2 (plan §10).
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
import Redis from "ioredis";

const log = createLogger("worker");
const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? 3002);

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
    // readiness problem, not a crash.
    redis.on("error", (err: Error) => {
      log.warn("redis connection error", { error: err.message });
    });
  }
  return redis;
}

async function isRedisReachable(): Promise<boolean> {
  try {
    const client = getRedis();
    if (client.status === "wait" || client.status === "end") {
      await client.connect();
    }
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

server.listen(HEALTH_PORT, () => {
  log.info("worker started", { port: HEALTH_PORT, phase: 0 });
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutting down", { signal });

  server.close();
  if (redis) await redis.quit().catch(() => undefined);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
