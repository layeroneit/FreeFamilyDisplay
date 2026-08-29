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
          A private dashboard for one family&apos;s wall displays. Accounts are
          invite-only.
        </p>
        <a
          href="/login"
          className="mt-4 inline-block rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ background: "var(--hearth-accent-1)", color: "#1a1a1a" }}
        >
          Sign in
        </a>
      </div>
    </main>
  );
}
