import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { claimInstance, instanceClaimState } from "@/lib/auth/bootstrap";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { claimIpLimiter } from "@/lib/auth/rate-limit";
import { clientIp, createSession, setSessionCookie } from "@/lib/auth/sessions";

export const dynamic = "force-dynamic";

const ClaimInput = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  displayName: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(128),
});

const ALREADY_CLAIMED = { error: "This display already has an account. Sign in instead." };
const NO_DATABASE = {
  error: "Couldn't reach the database. Check that the stack is fully up, then try again.",
};

/**
 * Cross-site write protection.
 *
 * Next's Origin/Host check covers Server Actions, NOT Route Handlers, and this
 * endpoint is unauthenticated and state-changing — there is no cookie or token
 * gating it, because on an unclaimed instance there is nobody to have one. So
 * while the instance is unclaimed, any page a household member happens to
 * visit could POST here and take the display:
 *
 *   fetch(url, { method: "POST", mode: "no-cors", body: JSON.stringify(...) })
 *
 * A `no-cors` fetch with a string body sends `text/plain`, which is
 * CORS-safelisted, so no preflight is sent and the request lands. The attacker
 * cannot read the opaque response, but they do not need to — they chose the
 * password. The family is then locked out of their own first run.
 *
 * Two checks, both required:
 *  - `Sec-Fetch-Site` must be same-origin or none. The browser sets this
 *    itself and page scripts cannot forge it. Absent means a non-browser
 *    client (curl, the runbook), which this does not try to block.
 *  - `Content-Type` must be JSON, which is NOT safelisted — so the attack
 *    above needs a preflight, and this route answers no OPTIONS.
 */
function isSameOriginWrite(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return false;
  return (req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");
}

/**
 * First-run claim (ADR 0004). Creates the account that owns this instance and
 * signs it in.
 *
 * Unlike the login route, this one does NOT hide its failure reasons: there is
 * nothing to disclose. On an unclaimed instance there are no accounts to
 * enumerate, and once claimed it refuses everything identically. Someone
 * setting up their own box deserves to be told their password is too short
 * rather than shrugged at.
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginWrite(req)) {
    return NextResponse.json({ error: "Cross-site requests are not accepted here." }, { status: 403 });
  }

  // Validation BEFORE the rate limiter, deliberately. The limiter exists to
  // cap bcrypt work, and a typo costs no bcrypt. Charging a token for an empty
  // form or a mistyped address would let an owner fumbling their own setup
  // form spend all ten attempts and lock themselves out of the only way in.
  const parsed = ClaimInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the name, email, and password and try again." },
      { status: 400 },
    );
  }

  const ip = await clientIp();
  const gate = claimIpLimiter.hit(`claim:${ip}`);
  if (gate.limited) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes and try again." },
      { status: 429, headers: { "retry-after": String(Math.ceil(gate.retryAfterMs / 1000)) } },
    );
  }

  // Cheap pre-check so a claimed instance never reaches the transaction or a
  // bcrypt hash. It is NOT the safety property — claimInstance re-checks under
  // a lock — it is the fast, common answer. The three-way state matters here:
  // "the database is down" must not be reported as "you already have an
  // account", which is a lie that sends the owner looking for a login.
  const state = await instanceClaimState();
  if (state === "unknown") return NextResponse.json(NO_DATABASE, { status: 503 });
  if (state === "claimed") return NextResponse.json(ALREADY_CLAIMED, { status: 409 });

  // Caught rather than allowed to propagate: an interactive transaction has a
  // 5s timeout and a 2s connection wait, and a stranger whose Postgres is
  // still warming up should get an instruction, not a blank 500.
  let result: Awaited<ReturnType<typeof claimInstance>>;
  try {
    result = await claimInstance({ ...parsed.data, ip });
  } catch {
    return NextResponse.json(NO_DATABASE, { status: 503 });
  }

  if (!result.ok) {
    if (result.reason === "weak-password") {
      return NextResponse.json(
        { error: `Use at least ${PASSWORD_MIN_LENGTH} characters. A short phrase you'll remember beats a clever short word.` },
        { status: 400 },
      );
    }
    // Lost the race against a simultaneous submission — the other one won.
    return NextResponse.json(ALREADY_CLAIMED, { status: 409 });
  }

  // Past this line the account EXISTS and is committed. A failure to mint the
  // session is therefore not a failed claim, and must not be reported as one:
  // telling the owner "something went wrong, try again" would send them back
  // to a form that now answers "this display already has an account" — two
  // contradictory statements about an account that is theirs and works. Report
  // the success, flag that signing in did not happen, and let the form send
  // them to /login.
  //
  // No audit call here: claimInstance already wrote `instance.claimed` with
  // this IP inside the transaction that created the account. A second
  // `auth.login.password.ok` row would put a password login in the trail that
  // never happened — the credential was created, not presented.
  try {
    const token = await createSession(result.userId, req.headers.get("user-agent"));
    await setSessionCookie(token);
  } catch {
    return NextResponse.json({ ok: true, signedIn: false }, { status: 200 });
  }

  return NextResponse.json({ ok: true, signedIn: true });
}
