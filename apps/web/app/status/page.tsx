/**
 * /status — the NOC page (operator request, 2026-08-29).
 *
 * Built-in rather than Grafana: no new infrastructure, and plan §9 already
 * owns the observability surface. Grafana stays parked for Phase 2, when
 * connector telemetry gives it something to graph. This page grows a
 * connector-health table in Phase 2 (§9's "answers it in five seconds").
 *
 * Session-gated: it reveals internal topology, so it is not public.
 * The worker check is an internal service call on the compose network —
 * not a third-party fetch, so §4.2 is not violated.
 */

import { redirect } from "next/navigation";
import { isDatabaseReachable } from "@ffd/db";
import { getSessionUser } from "@/lib/auth/sessions";
import { themeById, themeVars } from "@/lib/themes";
import { RefreshTimer } from "./refresh-timer";

export const metadata = { title: "Status — FreeFamilyDisplay" };
export const dynamic = "force-dynamic";

type Check = { name: string; ok: boolean; detail: string };

async function checkWorker(): Promise<{ worker: boolean; queue: boolean }> {
  const base = process.env.WORKER_URL ?? "http://worker:3002";
  try {
    const res = await fetch(`${base}/readyz`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    const body = (await res.json()) as { database?: boolean; queue?: boolean };
    return { worker: true, queue: body.queue === true };
  } catch {
    return { worker: false, queue: false };
  }
}

export default async function StatusPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const startedAt = Date.now();
  const [database, workerState] = await Promise.all([isDatabaseReachable(), checkWorker()]);
  const probeMs = Date.now() - startedAt;

  const checks: Check[] = [
    { name: "Web", ok: true, detail: "serving this page" },
    { name: "Database", ok: database, detail: database ? "reachable" : "unreachable" },
    { name: "Worker", ok: workerState.worker, detail: workerState.worker ? "responding" : "no response" },
    { name: "Queue (Redis)", ok: workerState.queue, detail: workerState.queue ? "reachable via worker" : "unreachable" },
  ];
  const allOk = checks.every((c) => c.ok);
  const theme = themeById(user.uiTheme);

  return (
    <main
      className="min-h-dvh px-6 py-10"
      style={{ ...themeVars(theme), background: "var(--hearth-bg)", color: "var(--hearth-text)" }}
    >
      <RefreshTimer />
      <div className="mx-auto max-w-3xl">
        <header className="flex items-baseline justify-between">
          <h1 className="text-3xl font-semibold tracking-tight" style={{ fontFamily: "var(--hearth-font-display)" }}>
            System status
          </h1>
          <span
            className="rounded-full px-3 py-1 text-sm font-semibold"
            style={{
              background: allOk ? "var(--hearth-accent-3)" : "var(--hearth-accent-4)",
              color: "#1a1a1a",
            }}
          >
            {allOk ? "All systems go" : "Something's off"}
          </span>
        </header>
        <p className="mt-1 text-sm" style={{ color: "var(--hearth-text-muted)" }}>
          Probed in {probeMs} ms · refreshes every 30 s · connector health lands here in Phase 2
        </p>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {checks.map((c) => (
            <div
              key={c.name}
              className="flex items-center justify-between rounded-xl border p-4"
              style={{ background: "var(--hearth-surface)", borderColor: "var(--hearth-border)" }}
            >
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-sm" style={{ color: "var(--hearth-text-muted)" }}>
                  {c.detail}
                </div>
              </div>
              <span
                aria-label={c.ok ? "healthy" : "unhealthy"}
                className="h-3.5 w-3.5 rounded-full"
                style={{ background: c.ok ? "var(--hearth-accent-3)" : "var(--hearth-accent-4)" }}
              />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
