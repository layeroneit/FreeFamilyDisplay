# Open questions and external blockers

Things the codebase cannot answer. Kept here so they do not get rediscovered
mid-phase. Resolve, then strike through with the answer and the date.

## Blocks Phase 1 — resolve before auth work starts

**~~SES sandbox status.~~** *(Resolved 2026-08-29)* Operator confirmed the
account has production access. The invite/magic-link flow is unblocked.

**~~SES credential separation — decision pending.~~** *(Moot 2026-08-30 —
ADR 0004.)* This is freeware that each household self-hosts, so it cannot
require an AWS account a stranger does not have. There is no email code in the
codebase and none is required; `SES_*` stays empty permanently, and if optional
email is ever built it is opt-in per instance. The separation question only
mattered while one shared sending identity was going to exist. None does.

**~~Hearth sending identity.~~** *(Moot 2026-08-30 — same reason.)* Nothing
sends, so nothing needs an identity.

> With those struck, **nothing under "Blocks Phase 1" is outstanding**, and
> email is off the critical path for any account to exist: ADR 0003 gave
> operators a local password, ADR 0004 gave them a local way to create it.
> What ADR 0004 *opened* instead: there is no in-app way to add a SECOND
> person. Invites are a schema model with no route and no UI. That work needs
> no email either.

## Blocks Phase 6 — needed before exposure

**Cloudflare account and tunnel hostname.** Also: whether Cloudflare Access sits
in front of the admin URL, and the bypass policy scoped to the kiosk path only
(wall tablets cannot complete an interactive auth challenge).

## Blocks Phase 1 backup verification

**Synology mount path** for nightly encrypted backups, and confirmation the VM
can reach it.

## Blocks Phase 4 — needed before the kiosk renderer is tuned

**~~Which Raspberry Pi model?~~** *(Resolved 2026-08-29)* Operator confirmed a
**Raspberry Pi 4** — exactly the baseline §7.8 was written against, so the
renderer budget stands unchanged.

**Still open: how much RAM on that Pi 4** (shipped in 1/2/4/8 GB). §7.8 assumes
2 GB. If 1 GB, the kiosk defaults to the 960×540 image variant; 4/8 GB means
comfortable headroom. Also worth knowing eventually: **Ethernet or Wi-Fi**, and
**TV over HDMI or a monitor** — TV overscan is a classic source of "the edges
are cut off" reports, and it is a display setting, not a renderer bug.

## Host state

**Does the Ubuntu VM exist on that host yet, and what storage backs it?** Per
CLAUDE.md, no Proxmox storage command is ever run from here — this is an operator
task, and the answer only needs reporting back.

## Resolved

**~~Auth.js "credentials provider" vs. the §8.1 magic-link flow.~~** *(2026-08-29)*
The v2 plan contradicted itself: §4.1 named Auth.js's credentials provider while
§8.1 described a hand-rolled token table. Resolved by dropping Auth.js entirely —
v3 §4.1 specifies hand-rolled passwordless auth with a signed session cookie,
following the other project's session mechanism but none of its credential model.

**~~`webcal://` cannot be fetched directly.~~** *(2026-08-29)* It is an http(s)
URL with a different scheme label. Rewrite to `https` before fetching — never
`http` — then apply the §8.3 resolved-IP check normally.

## Queued refactors

**Token prefix `--hearth-*` → `--ffd-*`.** The plan's original project name
leaks into every CSS token; the operator's wallpaper spec (and the product
name) say `--ffd-*`. Mechanical rename across `globals.css`, `lib/themes.ts`,
and the board components. Do it before Phase 3 hardens and before any custom
CSS is documented (§7.6 promises token names are the stable contract).

**Synology mount path** is needed *before* Phase 5 for a second reason now:
the wallpaper ingest ladder (~1,500 files across 14+ collections) must not
land on the container root disk.

## Deferred, with plumbing already in place

**Low-power display tier for effects.** `WidgetFrame.reduceEffects` and
`BoardBackdrop.effects` exist, but every render passes full effects: the
per-display "reduce effects" switch (spec §2, plan §7.8) needs the Phase 4
`displays` table to know which screen is asking. Until then the only gate
is the viewer's reduced-motion preference.

**Image ladder is WebP at 1920/2560 only.** No AVIF, no JPEG, no 3840 — a 4K
TV scales the 2560 asset. Spec §4 wants the full ladder; add it when a 4K wall
display exists to verify against.

## Parked proposals

**Grafana "NOC page" (operator request, 2026-08-29).** Self-hosted Grafana is
charter-compatible — nothing leaves the house. But it is a new dependency
needing §"Dependencies" justification, and plan §9 already specifies the health
surfaces (`/healthz`, `/readyz`, the connector health page). Decide alongside
Phase 2, when there is actually connector telemetry worth graphing; until then
it would chart an empty database.

## Noted, not blocking

**Nothing applies migrations yet.** The compose stack starts `web`/`worker` once
Postgres is *healthy*, not *migrated*, and `/readyz` runs `SELECT 1`, which
passes against an empty database. Harmless in Phase 0 (no queries exist), but
Phase 1's first migration must also decide the deploy mechanism — likely a
one-shot migrate container in the compose stack — and tighten `/readyz` to prove
schema presence, not just connectivity.

Plan §7 skips from 7.3 to 7.5. There is no §7.4 and nothing appears to be
missing; the numbering is simply not contiguous.
