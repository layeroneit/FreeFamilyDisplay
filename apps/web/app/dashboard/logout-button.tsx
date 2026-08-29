"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded-lg border px-3 py-1.5 text-sm"
      style={{ borderColor: "var(--hearth-border)", color: "var(--hearth-text-muted)" }}
      onClick={() => {
        void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
          router.push("/login");
          router.refresh();
        });
      }}
    >
      Sign out
    </button>
  );
}
