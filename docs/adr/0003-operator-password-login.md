# ADR 0003 — Operator accounts get a local password login

**Status:** Accepted — 2026-08-29 · **Amends:** plan §8.1, charter §4

## Context

Plan §8.1 opens with "there are no passwords in this system," and the charter's
acceptance test ends "she never created a password, because there isn't one."
The passwordless design's dependency is email delivery — and during first
deployment, with SES deliberately unwired, the operator asked for a local
password login for the admin account. The alternative (break-glass CLI-minted
login links, which need no email either) was put to the operator directly, with
the tradeoffs restated. The operator chose the password.

## Decision

**OPERATOR-role accounts may authenticate with a local password. MEMBER
accounts never can — there is no password field, form, or column path for
them.** The charter's acceptance test is unchanged for the people it describes:
family members sign up by invite and log in by magic link, and no family member
ever creates a password.

Requirements for the implementation (Phase 1, security-critical — tests ship in
the same change per CLAUDE.md):

- Password hash stored with **bcrypt** (matching the operator's other
  production app; boring and well-maintained), cost ≥ 12. Nullable column —
  null for every MEMBER, enforced at the repository layer, not just the UI.
- Rate limiting by IP and by account on the password endpoint; identical
  response for wrong-password and no-such-account.
- **TOTP still applies to operators** (§8.1) once implemented — the password
  does not replace the second factor, it replaces the email factor.
- No email-based password reset flow. A forgotten operator password is reset
  via the break-glass CLI on the box — which is still built, as it also covers
  the SES-outage case for magic links.
- The audit log records password logins distinctly from magic-link logins.

## Consequences

The system now carries a credential-stuffing surface and a hashing dependency
it was designed not to have — bounded to at most the one or two operator
accounts. In exchange the operator can always reach the admin UI with zero
cloud dependencies, including before SES exists and during email outages.

The word "never" in the charter's no-passwords language is narrowed to family
members. That narrowing is this document; nothing else in the charter moves.
