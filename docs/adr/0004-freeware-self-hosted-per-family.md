# ADR 0004 — Freeware: one self-hosted instance per family, claimed on first run

**Status:** Accepted — 2026-08-30 · **Amends:** charter §2, §4, §5, §6 ·
plan §1, §2, §3.1, §3.2, §6.7, §8.1, §8.4, §10 · **Narrows:** ADR 0003

## Context

Everything written before today assumed one shape: **one operator runs one
instance and invites family into it.** Plan §3.2 states "No public
registration. Signup requires a signed, single-use, 7-day invite token." The
charter's acceptance test opens "your sister gets an invite email." Plan §6.7
makes AWS SES required infrastructure — "this blocks the entire auth flow" —
and §3.1 lists it as the single paid-service exception. `create-operator.ts`
records the paradox in one line: it is "the only way the first login can exist,
since signup is invite-only and invites require an operator."

That shape only works if there is an operator to begin with. The operator has
decided this software is **freeware**: the repository goes public, and every
family that wants a wall display downloads it and stands up their own copy on
their own hardware. Nobody hosts anything for anybody else. The operator's
Proxmox box and Raspberry Pi stop being *the* deployment and become *a*
deployment — one household's copy, no different from a stranger's.

Under that model the invite chain has no root. A stranger who clones the repo,
brings the stack up, and opens the URL has an empty database, a login form they
cannot get past, and no invite coming, because there is nobody upstream to send
one. Today's answer is a `docker compose exec` incantation that appears in no
runbook — a terminal step the intended audience will not complete.

## Decision

**This software is distributed as freeware, self-hosted, one instance per
household. There is no hosted version, no company, and no operator with access
to anyone else's instance.** The repository is public.

**The first account is created through the web, not a terminal.** While the
database contains **zero users**, `/welcome` serves a one-time form that creates
an OPERATOR account with a local password (ADR 0003) and signs it in. The
moment any user exists the route returns `notFound()` and the API refuses.
`/setup` was not reused — it is already the board wizard.

Requirements for the implementation (security-critical per CLAUDE.md — tests
ship in the same change):

- The gate is **zero users**, not zero operators. Once anybody exists the door
  is shut, and only deleting every user row on the box reopens it.
- The emptiness check is taken under a **transaction-scoped Postgres advisory
  lock**, not a bare `if`. Prisma runs at READ COMMITTED, where two
  simultaneous submissions both truthfully observe an empty table and both
  insert; the unique index on email only catches them if they chose the same
  address. Exactly one claim may win.
- `instanceClaimed()` **fails closed**. A database error reports *claimed*, so
  a Postgres blip cannot briefly reopen account creation to anyone on the LAN.
- The endpoint is rate-limited on its own budget: every submission past
  validation costs a bcrypt-cost-12 hash on a family mini-PC.
- **The endpoint rejects cross-site writes.** Next's Origin/Host check covers
  Server Actions, not Route Handlers, and this is the only unauthenticated
  state-changing endpoint in the app — nothing gates it, because on an
  unclaimed instance nobody has a credential to gate it with. Without a check,
  any page a household member visited while the instance was fresh could
  `fetch(..., { mode: "no-cors" })` a claim through: a string body sends
  CORS-safelisted `text/plain`, so no preflight is sent and the request lands.
  The attacker cannot read the opaque response and does not need to — they
  chose the password. It requires `Sec-Fetch-Site` to be same-origin/none and
  `Content-Type` to be JSON, which is not safelisted.
- Rate limiting is applied AFTER input validation, not before. The limiter caps
  bcrypt work, and a typo costs no bcrypt; charging a token for an empty form
  would let the owner fumbling their own setup lock themselves out of the only
  way in.
- The claim does not bypass the agreement gate. The new account lands on
  `/dashboard`, which redirects to `/terms` like any other.
- `/` and `/login` redirect to `/welcome` while unclaimed, so the first visit
  to a fresh install has a next move.

**Email is optional, off by default, and nothing may hard-require it.** A
household on a LAN with no mail provider must be able to install, create an
account, sign in, and use every feature. The `SES_*` variables stay in
`.env.example` as reserved names for a future opt-in, and are documented as
"leave empty".

`create-operator.ts` survives — demoted from bootstrap to **recovery**. It is
how a forgotten password gets reset on the box, which ADR 0003 already made the
only reset path.

### What this invalidates

- **"No public registration" (plan §3.2, charter §4) gains one narrow, permanent
  exception**: a self-disabling first-run wizard reachable only at zero users.
  It stays true for every subsequent account, and no instance is on the public
  internet by default.
- **SES as required infrastructure (plan §6.7, §3.1, §10 Phase 1; charter §5,
  §6) is void.** "Email is the only way in" was already narrowed by ADR 0003;
  this finishes it. A stranger has no AWS account and must never need one.
  `email_suppressions` and the bounce/complaint pipeline are moot until email
  is actually built, and it is now an optional feature, not a dependency.
- **"The person who invited you" framing** (`lib/terms.ts`, `/login`, `/`) is
  wrong for the first account and misleading for the rest: no invite mechanism
  is implemented. Copy now says accounts are made by whoever set the display up.
- **Charter §2 "Not for: the public…"** splits. It stays true of one
  *instance* — ten accounts is the size of the thing. It is false of the
  *project*, which is now published for anyone to run.
- **Charter §5's "shared AWS SES account" and the the operator’s other project relationship** are
  operator-private facts. They stay in the internal docs and never appear in
  anything a stranger reads.
- **Plan §8.4 "TLS via Cloudflare"** is no longer the default. The shipped
  default is Caddy's internal CA on the LAN; the tunnel is already opt-in.
- **The break-glass CLI (plan §8.1)** loses its rationale. Its purpose was
  surviving an SES outage when email was the only factor; with a local password
  and a local first-run wizard there is no cloud dependency left to survive.

### What this does NOT change

The permanent non-goals get *stronger*, not weaker. No billing — there is
nothing to sell. **No telemetry, analytics, or crash reporting** — under
self-hosting that would mean phoning the upstream author's home from a
stranger's house, which is worse than what the charter forbade. No operator
access to user data — the operator is now a family member on their own
hardware. Every one of these is permanent and this ADR reinforces all of them.

Tenancy scoping, the SSRF guard, the custom-CSS boundary, and encryption at
rest are unchanged. A public repository means the threat model is now *read by
strangers*, which is a reason to hold those lines harder, not a reason to relax
them.

## Consequences

**Better.** The chicken-and-egg is gone: install, open the URL, create an
account, done — no terminal, no email, no cloud account, no credit card. The
project's stated ambition, a family owning their wall display outright instead
of renting it, now extends past one household. Removing SES from the critical
path deletes an entire class of failure (sandbox status, DKIM alignment, bounce
reputation) that a non-expert could neither diagnose nor fix.

**Worse.** A public repository is an inbound support surface the charter
explicitly never budgeted for — "one maintainer, spare hours" now faces issues
and pull requests from people whose hardware nobody has seen. Publishing also
freezes things that were still moving: the `--hearth-*` token prefix that
open-questions.md wanted renamed, and the absence of `docs/theming.md`, become
public API the moment someone writes custom CSS against them. And every
deployment trap this project hit in one evening — Alpine's missing `tzdata`,
Caddy's `default_sni` on a bare IP, `auto_https disable_redirects`,
`NET_BIND_SERVICE` under `no-new-privileges` — is now a stranger's trap too,
which is why they are written down in the README rather than left in commit
messages.

**Neutral.** The security posture is unchanged. A reader who sees "public repo"
and concludes the hardening rules relaxed has misread this document. The
first-run wizard is not public registration; it is a door that exists exactly
once and closes behind the person who owns the machine.

**Still open.** Two gaps this decision creates and does not close, both named
here so they are not mistaken for oversights:

1. **There is no in-app way to add a second person.** Invites are a schema
   model with no route, no UI, and no code that writes a row; the only account
   creation left is the recovery CLI, which mints OPERATORs. A household can
   install and run on one account today. An "Add someone" screen — an operator
   minting a local credential and handing it over in person — is the next
   piece of work, and it needs no email.
2. **Trusting the LAN certificate is documented for Linux only.** The admin UI
   is phone-first, and there are no instructions for Windows, macOS, Android,
   or iOS (which needs a two-step install). Every household hits this on day
   one.

## Alternatives considered

**Keep the CLI bootstrap and document it in the README.** No new code, no new
route, no new race to reason about. Rejected: the audience is explicitly
non-technical (charter §2), and `docker compose exec -e OP_PASSWORD='…'` is
where a family gives up. It also puts a password on a shell line, which the
script's own docstring goes out of its way to avoid.

**A setup token printed to the container logs, exchanged in the browser.** The
pattern several self-hosted projects use; it proves the person at the keyboard
controls the box. Rejected as ceremony for a threat that does not exist here:
the window is between `docker compose up` and the operator opening a browser,
on a LAN, on a machine they physically own. It reintroduces the terminal step
this decision exists to delete.

**A partial unique index guaranteeing at most one bootstrap row.** Purely
declarative, no lock to reason about. Rejected: it needs a sentinel column and
a migration to express "at most one user, ever" — a constraint that is false
five minutes later, once a second family member exists. The advisory lock
scopes the guarantee to the operation instead of embedding it in the schema.

**Publish under a "source available, don't run your own" license.** Preserves
the single-operator model. Rejected outright by the operator; it also
contradicts the charter's own argument, which is that a household should own
this rather than rent it.
