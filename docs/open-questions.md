# Open questions and external blockers

Things the codebase cannot answer. Kept here so they do not get rediscovered
mid-phase. Resolve, then strike through with the answer and the date.

## Blocks Phase 1 — resolve before auth work starts

**SES sandbox status.** Plan §6.7 requires confirming this rather than assuming
it. If the AWS account is still in the SES sandbox it can only send to
pre-verified addresses, which makes invite emails useless for anyone new and
blocks the entire auth flow. the operator's other project being live *suggests* production access was
granted, but that is inference, not confirmation.

**Hearth sending identity.** A distinct domain or subdomain with its own DKIM
keys and SPF alignment. Not yet chosen. Family should not receive dashboard mail
from a the operator's other project address, and a reputation problem on one project must not follow
the other.

**Dedicated IAM principal.** Scoped to `ses:SendEmail` and `ses:SendRawEmail`
only, with a condition restricting `From` to the identity above. Must not reuse
the operator's other project's credentials.

**SES configuration set + SNS topic** for bounces, complaints, and deliveries.
This is what attributes a reputation problem to the right project, and it is what
feeds `email_suppressions`.

## Blocks Phase 6 — needed before exposure

**Cloudflare account and tunnel hostname.** Also: whether Cloudflare Access sits
in front of the admin URL, and the bypass policy scoped to the kiosk path only
(wall tablets cannot complete an interactive auth challenge).

## Blocks Phase 1 backup verification

**Synology mount path** for nightly encrypted backups, and confirmation the VM
can reach it.

## Host state

**Does the Ubuntu VM exist on the operator's own host yet, and what storage backs it?** Per
CLAUDE.md, no Proxmox storage command is ever run from here — this is an operator
task, and the answer only needs reporting back.

## Resolved

**~~Auth.js "credentials provider" vs. the §8.1 magic-link flow.~~** *(2026-08-29)*
The v2 plan contradicted itself: §4.1 named Auth.js's credentials provider while
§8.1 described a hand-rolled token table. Resolved by dropping Auth.js entirely —
v3 §4.1 specifies hand-rolled passwordless auth with a signed session cookie,
following the operator's other project's session mechanism but none of its credential model.

**~~`webcal://` cannot be fetched directly.~~** *(2026-08-29)* It is an http(s)
URL with a different scheme label. Rewrite to `https` before fetching — never
`http` — then apply the §8.3 resolved-IP check normally.

## Noted, not blocking

Plan §7 skips from 7.3 to 7.5. There is no §7.4 and nothing appears to be
missing; the numbering is simply not contiguous.
