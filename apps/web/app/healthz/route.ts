import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness. Answers 200 whenever the process can serve a request.
 *
 * It deliberately does NOT touch Postgres or Redis. A liveness probe that
 * checks dependencies restarts a perfectly healthy container every time the
 * database hiccups, which turns a brief blip into an outage. Dependency state
 * belongs in /readyz.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok", service: "web" },
    { headers: { "cache-control": "no-store" } },
  );
}
