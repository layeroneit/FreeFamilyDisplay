/**
 * /status — the operator NOC page (rebuilt per operator feedback, 2026-08-29).
 *
 * Built-in rather than Grafana: no new infrastructure, and plan §9 owns the
 * observability surface. Grafana stays parked for Phase 2. This page gains the
 * connector-health table when connectors exist.
 *
 * Operator-gated: it reveals internal topology and the audit trail.
 * The worker probe is an internal service call on the compose network — not a
 * third-party fetch, so §4.2 holds.
 */

import { redirect } from "next/navigation";
import { prisma, isDatabaseReachable } from "@ffd/db";
import { getSessionUser } from "@/lib/auth/sessions";
import { termsCurrent } from "@/lib/terms";
import { RefreshTimer } from "./refresh-timer";

export const metadata = { title: "Status — Free Family Display" };
export const dynamic = "force-dynamic";

type Probe = { name: string; ok: boolean; detail: string; latencyMs: number | null };

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T | null; ms: number }> {
  const t0 = Date.now();
  try {
    return { result: await fn(), ms: Date.now() - t0 };
  } catch {
    return { result: null, ms: Date.now() - t0 };
  }
}

async function probeWorker(): Promise<{ up: boolean; queue: boolean; ms: number }> {
  const base = process.env.WORKER_URL ?? "http://worker:3002";
  const { result, ms } = await timed(async () => {
    const res = await fetch(`${base}/readyz`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    return (await res.json()) as { queue?: boolean };
  });
  return { up: result !== null, queue: result?.queue === true, ms };
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** "auth.login.password.ok" → "Signed in" — human verbs for the activity feed. */
const ACTION_LABELS: Record<string, string> = {
  "auth.login.password.ok": "Signed in",
  "auth.login.password.failed": "Failed sign-in",
  "auth.login.disabled": "Sign-in on disabled account",
  "auth.logout": "Signed out",
  "operator.bootstrap.created": "Operator account created",
  "operator.bootstrap.rotated": "Operator password rotated",
  "operator.bootstrap.reenabled": "Operator account re-enabled",
};

export default async function StatusPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!termsCurrent(user)) redirect("/terms");
  if (user.role !== "OPERATOR") redirect("/dashboard");

  const connectorRows = await prisma.cachedPayload
    .findMany({ orderBy: { fetchedAt: "desc" }, take: 40, select: { kind: true, key: true, fetchedAt: true, lastError: true, lastErrorAt: true } })
    .catch(() => [] as Array<{ kind: string; key: string; fetchedAt: Date; lastError: string | null; lastErrorAt: Date | null }>);
  const [db, worker, counts, recentAudit] = await Promise.all([
    timed(() => isDatabaseReachable()),
    probeWorker(),
    timed(async () => {
      const now = new Date();
      const [users, sessions] = await Promise.all([
        prisma.user.count({ where: { disabledAt: null } }),
        prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
      ]);
      return { users, sessions };
    }),
    timed(() =>
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, action: true, actorId: true, ip: true, createdAt: true },
      }),
    ),
  ]);

  // Resolve actor names for the activity feed (single query, id → name).
  const actorIds = [...new Set((recentAudit.result ?? []).flatMap((r) => (r.actorId ? [r.actorId] : [])))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } })
    : [];
  const nameOf = new Map(actors.map((a) => [a.id, a.displayName]));

  const probes: Probe[] = [
    { name: "Web", ok: true, detail: "serving this page", latencyMs: null },
    {
      name: "Database",
      ok: db.result === true,
      detail: db.result === true ? "PostgreSQL answering" : "unreachable",
      latencyMs: db.ms,
    },
    { name: "Worker", ok: worker.up, detail: worker.up ? "responding" : "no response", latencyMs: worker.ms },
    {
      name: "Queue",
      ok: worker.queue,
      detail: worker.queue ? "Redis reachable via worker" : "unreachable",
      latencyMs: null,
    },
  ];
  const allOk = probes.every((p) => p.ok);
  const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);

  const stats = [
    { label: "Accounts", value: String(counts.result?.users ?? "—") },
    { label: "Live sessions", value: String(counts.result?.sessions ?? "—") },
    { label: "Web uptime", value: formatUptime(process.uptime()) },
    { label: "Web memory", value: `${mem} MB` },
    { label: "Node", value: process.version },
  ];

  return (
    <main className="min-h-dvh px-6 py-10">
      <RefreshTimer />
      <div className="mx-auto max-w-4xl">
        {/* Hero */}
        <div
          className="flex items-center justify-between rounded-2xl border p-6"
          style={{
            background: "var(--hearth-surface)",
            borderColor: allOk ? "var(--hearth-accent-3)" : "var(--hearth-accent-4)",
          }}
        >
          <div className="flex items-center gap-4">
            <span
              className="noc-pulse h-5 w-5 rounded-full"
              style={{
                background: allOk ? "var(--hearth-accent-3)" : "var(--hearth-accent-4)",
                color: allOk ? "var(--hearth-accent-3)" : "var(--hearth-accent-4)",
              }}
            />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--hearth-font-display)" }}>
                {allOk ? "All systems go" : "Something needs attention"}
              </h1>
              <p className="text-sm" style={{ color: "var(--hearth-text-muted)" }}>
                Free Family Display · refreshes every 30 s
              </p>
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <div className="text-3xl font-semibold" style={{ color: "var(--hearth-accent-2)" }}>
              {db.ms} ms
            </div>
            <div className="text-xs" style={{ color: "var(--hearth-text-muted)" }}>
              database round-trip
            </div>
          </div>
        </div>

        {/* Service probes */}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {probes.map((p) => (
            <div
              key={p.name}
              className="rounded-xl border p-4"
              style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{p.name}</span>
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: p.ok ? "var(--hearth-accent-3)" : "var(--hearth-accent-4)" }}
                  aria-label={p.ok ? "healthy" : "unhealthy"}
                />
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--hearth-text-muted)" }}>
                {p.detail}
              </div>
              <div className="mt-2 text-lg font-semibold" style={{ color: "var(--hearth-accent-2)" }}>
                {p.latencyMs !== null ? `${p.latencyMs} ms` : "—"}
              </div>
            </div>
          ))}
        </div>

        {/* Instance stats */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border p-4 text-center"
              style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}
            >
              <div className="text-xl font-semibold">{s.value}</div>
              <div className="mt-0.5 text-xs" style={{ color: "var(--hearth-text-muted)" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Activity */}
        <section
          className="mt-5 rounded-xl border p-5"
          style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}
        >
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <p className="mb-3 text-xs" style={{ color: "var(--hearth-text-muted)" }}>
            Append-only audit trail — the answer to &ldquo;was that me?&rdquo;
          </p>
          {(recentAudit.result?.length ?? 0) === 0 ? (
            <p className="text-sm" style={{ color: "var(--hearth-text-muted)" }}>
              Nothing yet.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--hearth-border)" }}>
              {(recentAudit.result ?? []).map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">
                      {row.actorId ? (nameOf.get(row.actorId) ?? "Unknown") : "Someone"}
                    </span>{" "}
                    <span style={{ color: "var(--hearth-text-muted)" }}>
                      {ACTION_LABELS[row.action] ?? row.action}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs" style={{ color: "var(--hearth-text-muted)" }}>
                    {row.ip ?? ""} · {timeAgo(row.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Connector health — every cached source, newest first */}
        <section className="mt-5 rounded-xl border p-5" style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}>
          <h2 className="text-lg font-semibold">Connectors</h2>
          <p className="mb-3 text-xs" style={{ color: "var(--hearth-text-muted)" }}>
            Weather, calendars, photo links, wallpaper collections — what the worker last fetched, and what failed.
          </p>
          {connectorRows.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--hearth-text-muted)" }}>Nothing fetched yet.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--hearth-border)" }}>
              {connectorRows.map((r) => {
                const failing = Boolean(r.lastError) && (r.fetchedAt.getTime() === 0 || (r.lastErrorAt !== null && r.lastErrorAt > r.fetchedAt));
                return (
                  <li key={`${r.kind}:${r.key}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: "var(--hearth-bg)" }}>{r.kind}</span>
                      <span className="font-medium">{r.kind === "weather" || r.kind === "geocode" ? r.key : `widget ${r.key.slice(-6)}`}</span>
                      {r.lastError ? (
                        <span className="block truncate text-xs" style={{ color: failing ? "var(--hearth-accent-4)" : "var(--hearth-text-muted)" }}>
                          {failing ? "" : "last error (recovered): "}
                          {r.lastError}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs" style={{ color: "var(--hearth-text-muted)" }}>
                      {r.fetchedAt.getTime() > 0 ? `fetched ${timeAgo(r.fetchedAt)}` : "never fetched"}
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: failing ? "var(--hearth-accent-4)" : "var(--hearth-accent-3)" }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
