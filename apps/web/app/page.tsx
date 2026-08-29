export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6">
      <div>
        <h1
          className="text-4xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--hearth-font-display)" }}
        >
          FreeFamilyDisplay
        </h1>
        <p className="mt-2 text-lg" style={{ color: "var(--hearth-text-muted)" }}>
          Self-hosted family dashboard.
        </p>
      </div>

      <div
        className="rounded-xl border p-5"
        style={{
          background: "var(--hearth-surface)",
          borderColor: "var(--hearth-border)",
          borderRadius: "var(--hearth-radius)",
        }}
      >
        <p className="text-sm" style={{ color: "var(--hearth-text-muted)" }}>
          Phase 0 — foundation. Auth arrives in Phase 1, so there is nothing to sign
          in to yet. Health probes are live at{" "}
          <code style={{ color: "var(--hearth-accent-2)" }}>/healthz</code> and{" "}
          <code style={{ color: "var(--hearth-accent-2)" }}>/readyz</code>.
        </p>
      </div>
    </main>
  );
}
