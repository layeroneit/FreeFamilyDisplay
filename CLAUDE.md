# CLAUDE.md — FreeFamilyDisplay

Rules for AI agents working in this repository. Read `docs/project-plan.md` before your first change in any session.

## What this is

A self-hosted family dashboard. Private instance, ~10 accounts, ~15 wall displays. Not a product. Two surfaces: an admin URL people use from a phone, and a kiosk URL that renders a board and nothing else.

## Before you write code

1. Read the existing schema, types, and patterns. Do not introduce a second way to do something that already has a way.
2. Check which phase we are in. Phases are in Section 10 of the plan. Do not scaffold Phase 4 while Phase 2 is unfinished.
3. If a requirement is ambiguous, ask. A wrong assumption baked into the connector interface costs a week.
4. **Next.js 16 differs from your training data.** APIs, conventions, and file structure may all have changed. Read the relevant guide in `node_modules/next/dist/docs/` before writing App Router code. Heed deprecation notices.

## This is not the operator's other project

The operator also maintains the operator's other project, which shares this stack. That is the whole
relationship. **Do not import the operator's other project code, copy its schema, or assume its
patterns apply.** Tag is password-based, sells subscriptions, serves minors, and
grants operators moderation visibility — all four are things this project
deliberately does not do. See §4.5 of the plan.

Integration between them happens over a URL: Tag emits ICS share links, this app
consumes them through the ordinary calendar connector. If a task seems to require
tighter coupling than that, stop and ask.

## Absolute rules

**Never write a secret to disk.** No keys, tokens, passwords, or real URLs in code, comments, tests, fixtures, seed data, or commit messages. Local dev secrets go in `.env.example` as empty placeholders.

**Never run destructive commands.** No `docker compose down -v`. No `DROP DATABASE`. No `rm -rf` outside the build directory. No Proxmox storage commands of any kind — not `lvremove`, not `pvremove`, not `vgremove`, not `zfs destroy`, not `pvesm`. If a task seems to require one, stop and ask.

**Never edit an applied migration.** Migrations are forward-only. Never generate a `DROP TABLE` without an explicit instruction to do so.

**A user-supplied URL is a credential.** Encrypt it at rest. Mask it in the UI after save. It must never appear in a log line, an error message, an API response, or a stack trace.

## Security-critical code

These areas ship with tests in the same change, no exceptions:

- Authentication and session handling
- Tenancy scoping — every query touching user data is scoped by `user_id` at the repository layer
- Envelope encryption
- Device token issuance, validation, and revocation
- **The SSRF guard**

### SSRF guard specifics

The worker fetches arbitrary user-supplied URLs. This is the highest-risk surface in the app.

- Allowlist `https` and `webcal` only
- Resolve DNS, then validate the **resolved IP** against private, loopback, link-local, and reserved ranges. Validating the hostname alone is not sufficient and will be treated as a bug.
- Maximum 3 redirects, re-validate the resolved IP at every hop
- 10 MB response ceiling, 15 second timeout

Test against payloads targeting `127.0.0.1`, `169.254.169.254`, `10.0.0.0/8`, `192.168.0.0/16`, IPv6 loopback and link-local, decimal and hex-encoded IP literals, and a hostname under attacker control resolving to an internal address.

## Email

Sending goes through AWS SES on a **shared account that also serves a production app**. Treat its reputation as a shared resource you can damage.

- Never log a magic-link URL or token, in full or in part. Log the user id and the fact that a link was sent.
- Check `email_suppressions` before every send. Never retry a hard bounce.
- Consume a login token on first use even if session creation subsequently fails.
- Use the Hearth IAM principal and configuration set. Never the operator's other project's credentials or identity.
- Do not add new email types without asking. Every additional message is a reason for someone to mute the domain.

## Theming and custom CSS

**Custom CSS goes into the kiosk render surface only. Never the admin UI.** The admin UI holds calendar URLs in form inputs, and those URLs are credentials. CSS attribute selectors plus `url()` can exfiltrate input values a character at a time. This boundary is absolute and is not a performance or convenience tradeoff.

- Serve custom CSS from a same-origin route with `Content-Type: text/css`. Never inline it. `unsafe-inline` is never added to `style-src`.
- Reject `@import`. Reject or rewrite off-origin `url()`. 64 KB cap. Parse with postcss and reject on syntax error.
- Widgets are styled through `--hearth-*` tokens and expose stable `data-widget` and `data-part` attributes. Tailwind class names are unstable across builds and must never be a documented styling target.
- The "reset to theme" action must work when the board does not render. Someone will write `* { display: none }`.
- Board and theme sharing between accounts is v1.1 and requires operator review of any shared CSS. Do not implement sharing as an incidental feature — it changes the threat model.

## Architecture rules

**`web` makes no outbound third-party calls during a request.** All external fetching happens in `worker` on a schedule, writing normalized results to Postgres. The render path reads only from the database. If you find yourself adding a `fetch()` to an API route that hits an external host, you are solving the problem wrong.

**Connectors are uniform.** Adding a data source must not require touching the scheduler, the editor, or the renderer. If it does, the abstraction is wrong — fix the abstraction, don't special-case the connector.

**The canvas is fixed at 1920×1080.** Widgets are absolutely positioned in canvas pixels. The kiosk renderer scales the whole canvas with CSS `transform` to fit the screen. Do not add responsive reflow logic.

**The editor and the kiosk use the same renderer.** Not two implementations that look similar. One.

## Untrusted input

RSS content, ICS event titles, and calendar descriptions are attacker-influenced. A malicious calendar invite is a real vector. Sanitize on ingest, escape on render. No `dangerouslySetInnerHTML` in any widget renderer, ever.

## Dependencies

No new dependency without justification: what it does, why the stdlib or an existing dependency will not, and its maintenance status. Prefer boring and well-maintained. This project has no budget for a supply-chain incident.

## Style

- TypeScript strict. No `any`. No `@ts-ignore` without a comment explaining why.
- Zod schemas at every trust boundary — API input, connector config, external payloads.
- Commit in logical units. Messages describe the why, not the diff.
- Errors surfaced to users are actionable. "Calendar feed returned 404 — check the URL" beats "Fetch failed."

## Things that are not optional

- The cross-tenant isolation test exists before the second account is created.
- The backup restore script is proven working in Phase 1, not Phase 6. This host has lost storage before.
- The attribution line on stock-photo backgrounds is not removable. It is a license obligation.
