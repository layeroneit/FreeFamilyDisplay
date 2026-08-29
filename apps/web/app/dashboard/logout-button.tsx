"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded-lg border px-3 py-1.5 text-sm"
      style={{ borderColor: "var(--hearth-border)", color: "var(--hearth-text-muted)" }}
      onClick={async () => {
        // Navigate only on confirmed logout — a failed POST leaves the server
        // session live, and bouncing to /login would instantly redirect back
        // here while the user believes they signed out.
        try {
          const res = await fetch("/api/auth/logout", { method: "POST" });
          if (res.ok) {
            router.push("/login");
            router.refresh();
          }
        } catch {
          /* stay on the page; the button remains available to retry */
        }
      }}
    >
      Sign out
    </button>
  );
}
