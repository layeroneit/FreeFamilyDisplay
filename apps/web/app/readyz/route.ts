import { NextResponse } from "next/server";
import { isDatabaseReachable } from "@ffd/db";

export const dynamic = "force-dynamic";

/**
 * Readiness. 200 only when this instance can actually serve a board.
 *
 * `web` reads exclusively from Postgres (plan §4.2), so the database is the
 * only dependency that matters here — Redis is the worker's concern and its
 * readiness is reported by the worker's own probe.
 *
 * The response says whether the check passed and nothing about why. Postgres
 * error text can include a connection string, and a connection string includes
 * a password.
 */
export async function GET() {
  const database = await isDatabaseReachable();

  return NextResponse.json(
    { status: database ? "ready" : "not-ready", service: "web", database },
    { status: database ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
