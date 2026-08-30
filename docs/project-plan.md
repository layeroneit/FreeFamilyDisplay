# FreeFamilyDisplay — Self-Hosted Family Dashboard

**Project plan and build specification — v3**
Host: Proxmox VE ("the operator's own host"), Ubuntu 24.04 LTS VM
Scale: ~10 accounts, ~15 displays, family and friends only

> **v3 changes (2026-08-29).** Three decisions were taken after review of the Tag
> App codebase, and they supersede the v2 text wherever the two disagree:
>
> 1. **Runs in an Ubuntu 24.04 LTS VM, not an unprivileged LXC** (§8.7). See
>    `docs/adr/0001-vm-over-lxc.md`. All container hardening still applies inside
>    the VM.
> 2. **The stack follows the operator's other project's** (§4.1) — Next 16, Prisma 7, Tailwind v4,
>    hand-rolled sessions. Rationale in §4.1. Drizzle and Auth.js are out.
> 3. **This stays a standalone app; it does not merge into Tag** (§4.5). Family
>    sharing is achieved by consuming Tag's existing ICS share links as an
>    ordinary connector.

---

## 1. Project goal

Build a free, self-hosted web app that replaces Mango Display for a private group of family and friends. Each person signs up with an invite link, connects their own calendar and photo sources by pasting secure URLs, arranges widgets freely on a canvas, and pushes the result to wall screens running a browser in kiosk mode.

Two surfaces, and the split is the whole design:

- **Admin URL** — phone-friendly. Sign in, connect sources, drag widgets, pair a screen. This is where all interaction happens.
- **Kiosk URL** — a dumb renderer. No login, no controls, no interaction. Paired once, then never touched again.

**Success looks like:** your sister gets an invite email, clicks it, pastes her iCloud calendar share URL, drags four widgets onto a board, taps "Pair display," enters a 6-digit code on her kitchen tablet, and walks away. It's still correct in thirty days. She never created a password because there isn't one.

---

## 2. Scope

### In scope (v1.0)

- Invite-only accounts, passwordless magic-link login, 90-day sessions
- Transactional email via the existing AWS SES account (separate identity and IAM principal)
- Opt-in digest alerts for failing connectors and offline displays
- URL-based connectors for calendar, photos, and feeds
- Weather via Open-Meteo, alerts via NWS
- Free stock photo backgrounds via Openverse, Wikimedia, Pexels
- Free-canvas board editor with drag, resize, and layers
- Per-widget format overrides — background, font, color, corners, opacity
- 10 built-in themes plus per-board custom CSS upload
- Display pairing by 6-digit code, revocable device tokens
- Kiosk renderer with offline degradation
- Docker Compose on Proxmox, Cloudflare Tunnel exposure
- Nightly encrypted backup to the Synology NAS with a tested restore

### Out of scope (v1.0)

- Public signup, billing, telemetry, analytics
- Native mobile apps — admin UI is a responsive PWA
- Chores, meals, shopping lists, tasks — v1.1
- Google Calendar OAuth — v1.1, see 6.2
- Video widgets, touch interaction, multi-page rotation

### Permanent non-goals

- No third-party telemetry or crash reporting.
- No operator ability to read another user's calendar contents. Operators manage accounts, not data.

---

## 3. Hard constraints

1. No *new* paid services. Every dependency works on a free tier without a credit card. The one exception is the existing AWS SES account, reused under a separate identity — at family volume this is cents per month.
2. No public registration. Signup requires a signed, single-use, 7-day invite token.
3. All user-supplied URLs and credentials are encrypted at rest. **An unlisted URL is a bearer credential — treat it exactly like a password.**
4. The kiosk display never holds a user session. It holds a scoped, revocable, read-only device token for one board.
5. No secrets in the repository. Not in code, tests, fixtures, seeds, or commit messages.
6. Nightly backup with a **proven** restore path, delivered in Phase 1, not Phase 6.
7. Containers run as non-root, no Docker socket mounts, no `--privileged`.
8. **The kiosk renderer targets a Raspberry Pi**, not a desktop. §7.8 sets the
   budget. Any feature that cannot meet it on the weakest display is degraded on
   that display rather than allowed to degrade the display.

---

## 4. Architecture

### 4.1 Stack

| Layer | Choice |
|---|---|
| Language | TypeScript, strict |
| Runtime | Node.js 22 LTS |
| Framework | Next.js 16, App Router |
| Database | PostgreSQL 16 |
| Queue / cache | Redis 7 + BullMQ |
| ORM | Prisma 7 |
| Auth | Passwordless, hand-rolled — signed session cookie, own token tables |
| Styling | Tailwind CSS v4 |
| Proxy | Caddy |
| Exposure | Cloudflare Tunnel |

**Why this stack and not the v2 one.** The operator of this project also
maintains the operator's other project, which runs Next 16, Prisma 7, and Tailwind v4 with hand-rolled
signed-cookie sessions. Running a family side project on a second ORM (Drizzle)
and a second auth library (Auth.js) doubles the maintenance context for no
benefit. Sharing the stack means one set of habits, one migration workflow, and
patterns that transfer in both directions.

Two things do **not** follow Tag:

- **Redis + BullMQ stays.** Tag has no queue, and the consequence is visible in
  its `POST /api/wire/sync` route, which fetches external RSS inside a request
  handler with a 120-second budget. §4.2's no-outbound-calls-in-a-request rule
  exists to prevent exactly that, and it needs somewhere for the work to go.
- **Auth is passwordless.** Tag is password-based with reset flows and
  subscription gating. §8.1 here is unchanged: no passwords exist in this system.
  Only the *session cookie mechanism* is borrowed from Tag, not the credential
  model.

### 4.2 Services

```
cloudflared    outbound tunnel, no inbound ports
caddy          internal proxy, security headers
web            Next.js — admin UI, API, kiosk renderer
worker         BullMQ consumer, all outbound fetching
postgres       datastore
redis          queue + cache
```

**Hard rule:** `web` makes no outbound third-party calls during a request. `worker` fetches on a schedule and writes normalized results to Postgres. The render path reads only from the database. This keeps boards instant, keeps them alive through an upstream outage, and stops a slow feed from hanging a page load.

### 4.3 Layout

```
/apps/web              Next.js app
/apps/worker           Job runner
/packages/db           Prisma schema, migrations, seed, generated client
/packages/connectors   One module per source, uniform interface
/packages/widgets      Widget schema, defaults, renderer
/packages/crypto       Envelope encryption
/packages/stockpile    Freeware image manifest (§6.6.1) — metadata only, no binaries
/infra                 Compose, Caddyfile, tunnel config, backup scripts
/docs                  ADRs, runbook, restore procedure
```

**npm workspaces, not pnpm.** the operator's other project uses npm, and npm is what is installed on
the operator's machine. A second package manager for a side project is friction
without payoff.

### 4.4 Connector interface

The most important abstraction in the project. Adding a source must never require touching the scheduler, the editor, or the renderer.

```ts
interface Connector<TConfig, TPayload> {
  id: string;
  displayName: string;
  authKind: 'url' | 'none';        // v1.0 is URL-only
  configSchema: z.ZodType<TConfig>;
  defaultRefreshSeconds: number;
  fetch(ctx: ConnectorContext, config: TConfig): Promise<TPayload>;
  healthCheck(ctx: ConnectorContext, config: TConfig): Promise<HealthResult>;
}
```

`zod` is a new dependency relative to the operator's other project, which does not use it. It is
justified by the style rule requiring schemas at every trust boundary, and by
this interface — connector config is user-supplied and must be validated before
it reaches a fetch.

### 4.5 Relationship to the operator's other project

**FreeFamilyDisplay is a standalone application. It does not merge into the operator's other project,
and the operator's other project code is not imported here.** The two share an operator, a host, and a
stack — nothing else.

Family sharing between the two works through data, not code. Tag already emits
RFC 5545 calendar feeds behind revocable bearer-token share links. A Tag user
shares that link and pastes it into a FreeFamilyDisplay calendar connection,
where it is treated exactly like any other ICS URL: encrypted at rest, fetched by
`worker`, run through the SSRF guard. No special case, no shared schema, no
coupling. Photo share links follow the same path into §6.3 when that lands.

Reasons the codebases stay apart, recorded so the decision does not get relitigated:

- Tag is password-based with subscription gating and age-graded accounts. §8.1
  here specifies that no passwords exist. One account system cannot hold both
  without one becoming a permanently awkward special case.
- Tag carries Stripe, Sentry, and HTTP telemetry. §2 lists billing, telemetry,
  and third-party crash reporting as **permanent non-goals** here.
- Tag grants operators moderation and compliance visibility into user content —
  a safety requirement for a product serving minors. §2 states operators here
  manage accounts, not data. These are opposite by design.
- §7.6's custom-CSS boundary is holdable across two surfaces. Across Tag's ~176
  API routes sharing an origin with messaging, payments, and minors' data, it is
  not a boundary anyone should promise to hold.

If Tag ever needs a wall-display feature of its own, it consumes this app the
same way — over a URL.

---

## 5. Data model

- `users` — id, email, display_name, role, created_at, disabled_at, notify_prefs_json
- `invites` — token_hash, created_by, expires_at, consumed_at, consumed_by
- `login_tokens` — token_hash, user_id, expires_at, consumed_at, requested_ip
- `email_suppressions` — address, reason (bounce/complaint), created_at
- `sessions` — Auth.js managed, 90-day rolling
- `connections` — id, user_id, connector_id, label, encrypted_url, config_json, status, last_ok_at, last_error
- `boards` — id, owner_id, name, theme_id, theme_overrides_json, custom_css_raw, custom_css_validated, canvas_w (1920), canvas_h (1080)
- `board_widgets` — id, board_id, widget_type, x, y, w, h, z, config_json, format_json
- `displays` — id, board_id, name, token_hash, background_override_json, last_seen_at, revoked_at
- `pairing_codes` — code, board_id, expires_at, consumed_at
- `cached_payloads` — connection_id, payload_json, fetched_at, expires_at
- `cached_images` — source, source_id, local_path, attribution_json, fetched_at
- `audit_log` — actor_id, action, target_type, target_id, ip, created_at

**Tenancy rule:** every query touching user data is scoped by `user_id` at the repository layer. A test asserting user A cannot read user B's board, connection, or display by direct ID manipulation must exist before the second account is created.

---

## 6. Integrations

### 6.1 Calendar — URL feeds (the primary path)

Any `webcal://` or `https://` ICS URL. Covers iCloud published calendars, Google's secret-address ICS export, Outlook and M365 published calendars, school districts, sports schedules.

The user pastes one URL into one text box. That is the entire flow. Build this first — it is also the cheapest way to test the calendar widget.

**This is also the the operator's other project integration path (§4.5).** A Tag calendar share link is
an ICS URL behind a revocable bearer token. It arrives through this connector
with no special handling, which is the point — a family member's Tag calendar
lands on the kitchen wall without either codebase knowing about the other.

Parse with `ical.js` or `node-ical`. Handle recurrence rules, all-day events, and timezones correctly; these are where ICS parsing usually goes wrong. Expand recurrences server-side into a flat event list for the render window.

### 6.2 Calendar — Google OAuth (deferred to v1.1)

Not in v1.0. Google's secret-address ICS export covers the family case with zero OAuth complexity. Revisit only if someone hits a real limitation — the main one being that the ICS export refreshes on Google's schedule, not yours, and can lag a few hours.

### 6.3 Photos — URL sources

- iCloud shared album links
- **Google Drive public folder links** — see below
- Immich, Synology Photos, or Nextcloud public share links
- A directory index URL, or a plain list of image URLs
- Direct upload through the admin UI, per-user quota

Fetch, cache locally, serve from the local cache. The board must keep showing photos when the source is unreachable.

Every fetched image is **re-encoded and pre-scaled at ingest** to the sizes the
renderer actually paints (§7.8). Originals are not served to displays. A phone
camera photo is several thousand pixels wide; painting it in a 400 px panel on a
Raspberry Pi wastes decode time and holds the full bitmap in memory for as long
as it is on screen.

#### Google as a photo source

Two Google paths matter here and they are not the same thing:

**Google Calendar** is already covered. Its "secret address in iCal format" is an
ICS URL and goes through §6.1 unchanged. That is why OAuth is deferred (§6.2) —
nothing extra is needed for calendars.

**Google Photos does not offer a paste-a-URL path, and this is worth stating
plainly so it does not get attempted twice.** A shared album link resolves to an
HTML page, not a feed. There is no unauthenticated API behind it. The Library API
no longer grants broad read access to a user's library for new applications, and
the sanctioned replacement is a picker flow requiring OAuth plus periodic user
interaction — which is the opposite of "paste it once and walk away." Scraping the
share page is technically possible, brittle against markup changes, and
questionable against Google's terms. It is not the foundation for something meant
to run untouched for thirty days.

**Google Drive public folder links are the recommended Google path.** A user
shares a Drive folder as "anyone with the link," pastes that link, and `worker`
lists the folder and fetches the images. This fits the model exactly: one URL,
one text box, no OAuth, no expiring session, and the folder is something the user
can add photos to from their phone afterward. It needs one instance-wide Google
API key in `.env`, never exposed to users, in the same shape as the Pexels key in
§6.6.

Treat the Drive link as a credential like every other pasted URL (§8.2) — anyone
holding it can read the folder.

*Google Photos support, if it is ever wanted, belongs in v1.1 next to Google
Calendar OAuth, since both need the same consent plumbing.*

### 6.4 Weather

**Open-Meteo** for current conditions and forecast. Free, no key, no account. Cache 15 minutes for current, 1 hour for forecast.

**NWS (`api.weather.gov`)** for alerts. Free, no key, US only. Requires a descriptive `User-Agent` with contact info — honor it. Cache 5 minutes. A tornado warning that takes over the board is a genuine feature in Wisconsin; build the alert widget with a full-bleed override mode.

### 6.5 News

Generic RSS/Atom by URL. No vendor, no key. Ship a small starter list, hardcode nothing. Feed content is untrusted input — sanitize on ingest, escape on render.

### 6.6 Stock backgrounds

| Source | Key | Notes |
|---|---|---|
| Openverse | none | Default. CC-licensed, huge library. |
| Wikimedia Commons | none | Strong on landscape and places. |
| Pexels | one instance key in `.env` | 200/hr, 20k/month. Best quality tier. |

Instance-wide key, never exposed to users. The app works without it — Openverse and Wikimedia carry the feature on their own.

Search by keyword, curated category chips ("landscape," "mountains," "seasonal"). Cache selected images to local disk; never hotlink on every render.

**Attribution is mandatory.** A small credit line renders on any board using a stock image. Position, size, and opacity are styleable. It is not removable. Store photographer, source, and license in `cached_images.attribution_json` at fetch time.

The credit line stays even for CC0 and public-domain images, where no license
obliges it. Rendering it always keeps the rule a simple invariant — "stock image
implies credit line" — rather than a per-license conditional that eventually gets
a bug. Public-domain images credit the source rather than a photographer.

#### 6.6.0 Wallpaper collections (operator spec, 2026-08-30)

Curated 8–15 image sets — space, cars, Northwoods, a family's own vacation —
that sit behind a board and **rotate weekly by default**. Fully specified in
`docs/specs/wallpaper-collections.md`: ingest-time luminance analysis drives a
per-image scrim and text color so any theme stays legible over any photo;
rotation is a worker job with pin/skip; custom collections come from uploads or
photo-share URLs. Built-ins are free-license only (NASA, cars, an aesthetic
gaming set); anime and franchise art are user-supplied by design. The §6.6.1
stockpile below is the *seed* of the built-in collections, not a separate
system.

#### 6.6.1 The bundled stockpile

Live search covers the case where someone wants a specific image. It does not
cover the case that actually matters more: **a new board, on a fresh install,
looking good immediately and continuing to look good with no internet.**

So the instance keeps a **local stockpile of freely licensed images**, seeded
once at install and served from disk forever after. This is what backgrounds a
board on day one, what the default board (§7.7) uses, and what a display falls
back to when every remote source is unreachable.

**Sources, all free and keyless unless noted:**

| Source | Key | License | Good for |
|---|---|---|---|
| Openverse | none | CC, mixed | General breadth; the default search backend |
| Wikimedia Commons | none | CC / PD, mixed | Landscape, places, seasonal |
| NASA Image Library | none | Public domain | Space, earth-from-orbit — strong wall-display material |
| Smithsonian Open Access | none | CC0 | Art, nature, historical |
| Met Museum Open Access | none | CC0 | Art, texture, still life |
| Pexels | one instance key | Pexels license | Highest quality tier; optional |

Every one of these works without a credit card, which §3 requires. Pexels is the
only one needing a key, and the feature is fully functional without it.

**Shape of the thing:**

- **Target ~250 images across ~8 categories** — landscape, mountains, water,
  sky/space, seasonal (four sets), abstract/texture, art. Enough that a board
  rotating daily does not repeat within a year; small enough to curate honestly.
- **Pre-scaled at seed time** to the sizes §7.8 wants — 1920×1080 and a 960×540
  variant for low-power displays — in a modern format. Roughly 60–80 MB total,
  which is nothing against the 40 GB disk and everything against a Pi's decode
  budget.
- **The manifest is in git; the binaries are not.** `packages/stockpile/manifest.json`
  holds source URL, license, attribution, category, and a content hash for each
  entry. `scripts/seed-stockpile.ts` fetches, verifies the hash, re-encodes, and
  writes `cached_images` rows. This keeps the repository small, makes the seed
  reproducible, and — most importantly — makes the licensing **reviewable in a
  diff**. An image whose license cannot be established does not go in the
  manifest.
- **Seeding runs through the §8.3 SSRF guard** like every other outbound fetch.
  The manifest is trusted input, but there is no reason to build a second fetch
  path that isn't.
- **It is refreshable, not frozen.** Re-running the seed script adds new manifest
  entries without disturbing existing ones or anyone's board.

Attribution rules above apply to stockpile images identically. The manifest is
the record; `cached_images.attribution_json` is populated from it at seed time.

### 6.7 Email — AWS SES (reused account)

The SES account already serving the operator's other project is reused. **Reused account, not reused configuration.** Three separations are required:

**Separate verified identity.** Register a distinct sending domain or subdomain for Hearth with its own DKIM keys and its own SPF alignment. Family should not receive calendar mail from a the operator's other project address, and a domain reputation problem on one project should not follow the other.

**Separate IAM principal.** Create a dedicated IAM user or role for Hearth scoped to `ses:SendEmail` and `ses:SendRawEmail` only, with a condition restricting the `From` address to the Hearth identity. Do not reuse the operator's other project's credentials. If Hearth is compromised, it must not be able to send as the operator's other project.

**Separate configuration set.** Give Hearth its own SES configuration set with an SNS event destination for bounces, complaints, and deliveries. This is what lets you attribute a reputation problem to the right project.

**Bounce and complaint handling is mandatory, not optional.** SES enforces reputation at the *account* level. Bounces from Hearth count against the account the operator's other project depends on. AWS reviews accounts around 5% bounce and 0.1% complaint rates. A dozen hand-typed family addresses is low volume but high typo risk — one wrong address retried on a schedule is enough to matter.

Required: subscribe to the SNS topic, write bounced and complained addresses to `email_suppressions`, and check that table before every send. Never retry a hard bounce.

**Verify sandbox status before Phase 1.** If the account still has SES sandbox access, it can only send to verified addresses, which makes the invite flow useless for anyone new. the operator's other project being live suggests production access was already granted, but confirm rather than assume — this blocks the entire auth flow.

**Notifications.** Now that email exists, use it sparingly:

- Connector failing for more than 24 hours — one digest per user per day, never per-event
- Display offline for more than 6 hours
- Opt-in, per-category, with a working unsubscribe

Do not send anything else. A family dashboard that emails people is a family dashboard people mute.

### 6.8 Local widgets

Clock, date, quote (bundled corpus, no API), notes, countdown. No external dependency.

---

## 7. The board editor

This is the feature that decides whether anyone uses the app. Budget accordingly.

### 7.1 Canvas model

**Fixed logical canvas, 1920×1080.** Widgets are absolutely positioned in canvas pixels. The kiosk renderer scales the whole canvas with CSS `transform` to fit the actual screen and letterboxes the remainder in the board background color.

This gives pixel-exact placement in the editor and correct rendering on a 4K TV, a 1080p monitor, and a portrait iPad, with no responsive reflow logic anywhere. It is what Mango does and it is the right call.

### 7.2 Editor behavior

- Drag to move, corner and edge handles to resize
- Snap to a 10px grid, hold a modifier to disable
- Alignment guides against canvas edges, center lines, and neighboring widget edges
- A layers panel listing widgets in z-order, drag to reorder
- Multi-select with shift, move and align as a group
- Undo/redo, at least 20 steps
- Arrow keys nudge 1px, shift-arrow nudges 10px
- Live preview — the editor canvas is the same renderer the kiosk uses, not a separate approximation

### 7.3 Format panel

Per widget, overriding a board default:

- Font family, size, weight, color, alignment
- Background color and opacity
- Corner radius, padding
- Border, shadow, backdrop blur
- Show/hide toggle

Board-level defaults cascade to every widget that has not been individually overridden. Make the override state visible — a small "customized" marker and a "reset to board default" action. Users get lost here otherwise.

### 7.5 Theme system

Themes are pure token sets. A theme changes CSS custom properties and font stacks; it does not change layout, markup, or widget behavior. This is what makes custom CSS tractable later.

**Token contract.** Every widget renders against these variables and nothing else:

```
--hearth-bg              page background
--hearth-surface         widget panel background
--hearth-border          panel border
--hearth-text            primary text
--hearth-text-muted      secondary text
--hearth-accent-1 .. 4   accent ramp
--hearth-font-display    headline and clock font
--hearth-font-body       everything else
--hearth-radius          panel corner radius
--hearth-shadow          panel shadow
```

**Stable hooks are mandatory.** Every widget root carries `data-widget="clock"`, `data-widget="calendar"`, and so on, plus `data-widget-id="<uuid>"`. Internal elements carry stable `data-part` attributes (`data-part="event-title"`, `data-part="temp-high"`). Tailwind's generated class names are unstable across builds and must never be the target of custom CSS. Document the full hook list in `/docs/theming.md` — it is the public API of the theme system and changing it breaks people's boards.

**Built-in themes (10).**

| Theme | Background | Surface | Text | Muted | Accents |
|---|---|---|---|---|---|
| Midnight *(default)* | `#101B33` | `#1B2745` | `#F0EBE0` | `#8FA0C4` | `#FFD23F` `#2EE6F6` `#86E57F` `#FF8A5B` |
| Deep space | `#05060F` | `#0E1122` | `#E4E8F5` | `#7A82A6` | `#7DF9FF` `#C77DFF` `#FFD6E0` `#4EA8FF` |
| Spring | `#F4F9EF` | `#FFFFFF` | `#23331C` | `#6B7D62` | `#E86A92` `#4C9A3F` `#F2B705` `#5FA8D3` |
| Summer | `#FFF8E7` | `#FFFFFF` | `#2B2416` | `#7D7259` | `#FF6B35` `#00A6A6` `#F7B801` `#2E86AB` |
| Autumn | `#1E1410` | `#2C1E17` | `#F5E6D3` | `#A88B72` | `#E8871E` `#C1440E` `#D4A017` `#8A9A5B` |
| Winter | `#0E1A24` | `#16283A` | `#EAF4FA` | `#7E9BB0` | `#6FE8FF` `#C8E7F5` `#A9D6E5` `#4A90C2` |
| Chalkboard | `#2A3230` | `#333B39` | `#F2F0E6` | `#9AA39F` | `#FFE066` `#7FD1AE` `#FF9AA2` `#A8D0E6` |
| Kraft | `#F5F1E8` | `#FFFFFF` | `#2E2A22` | `#7A7263` | `#C25E2A` `#4A7C59` `#9B5DE5` `#1B7A8C` |
| Neon arcade | `#0A0A0F` | `#14141F` | `#F5F5FF` | `#6E6E8A` | `#FF2E88` `#A8FF3E` `#00E5FF` `#FFB300` |
| Nordic | `#ECEFF4` | `#FFFFFF` | `#2E3440` | `#6C7A8C` | `#5E81AC` `#A3BE8C` `#B48EAD` `#D08770` |

Deep space and Chalkboard ship an optional decorative background layer (starfield, slate texture) rendered as inline SVG, not a raster asset. Seasonal themes are selectable at any time — do not auto-switch by date. People pick a theme because they like it, not because it is October.

Font pairings ship with each theme. Bundle the webfonts locally under `/apps/web/public/fonts`; never call Google Fonts at render time. A kiosk display on a flaky connection must not lose its typography.

**Cascade order:** theme tokens → board-level overrides → per-widget format overrides → custom CSS. Custom CSS wins, which is the point of it.

### 7.6 Custom CSS

Per-board, authored in a code editor in the admin UI or uploaded as a `.css` file. Stored in `boards.custom_css`. Applied to the kiosk renderer and to the editor preview.

**Scope rule, non-negotiable: custom CSS is injected into the kiosk render surface only. Never into the admin UI.** The admin UI contains form inputs holding calendar URLs — which are credentials. CSS attribute selectors combined with `url()` can exfiltrate input values character by character. This is a well-known technique and it is why the boundary is absolute.

**Delivery under CSP.** The stylesheet is served from a same-origin route (`/api/boards/:id/custom.css`) with `Content-Type: text/css`, not inlined into the document. `style-src 'self'` stays intact and `unsafe-inline` is never introduced.

**Ingest validation:**
- Reject `@import` outright. It fetches remote stylesheets and defeats the origin controls.
- Rewrite or reject `url()` references pointing off-origin. Users who want a background image upload it or paste a URL through the photo connector, which already has SSRF protection.
- Size cap: 64 KB.
- Parse with a real CSS parser (`postcss`) and reject on syntax error rather than storing something that silently breaks a wall display.
- Store the raw source alongside the validated output so users can edit what they wrote.

**Blast radius.** In v1.0 a user's CSS applies only to their own boards with their own data, so the realistic worst case is that someone breaks their own display. Two guard rails keep it that way:

1. A "reset to theme" button that clears custom CSS, reachable without the board rendering correctly. If someone writes `* { display: none }`, they must still be able to undo it.
2. **Board and theme sharing between accounts is deferred to v1.1, and when it ships, shared custom CSS requires operator review.** The moment user A's CSS renders against user B's calendar data, the threat model changes completely and the exfiltration path becomes real. Do not let sharing land quietly as a "small feature."

**Kiosk safety.** Wrap the render surface in an error boundary that falls back to the built-in theme if the board fails to paint. A wall display that has gone blank is worse than one that looks wrong.

### 7.7 Ship a default board

New accounts get a pre-built board matching the reference layout: quote, clock, greeting, date, 5-day weather strip, two-week calendar, news list, photo panel. Nobody should face an empty canvas on day one.

### 7.7.5 Weather-reactive ambiance (operator request, 2026-08-29)

Boards can opt into a **weather mood layer**: the board's look shifts with
current conditions at the board's location. Sunny brightens the palette with a
warm hue; overcast mutes it; rain darkens the board with raindrops; storms go
darker still with occasional lightning flashes; snow, fog, and heat get their
own treatments. Data comes from the §6.4 Open-Meteo cache — the kiosk never
fetches weather itself; it reads what `worker` already wrote.

**Opt-in, per board.** §7.5's principle stands: people pick a theme because
they like it. Weather mood is a mode the user chooses, layered *over* their
chosen theme — never an override that repaints the board without consent. A
"mood strength" slider (subtle → full) ships with it.

**Tiered by display capability, because of §7.8:**

- **Tier 1 — hue and tone (all displays, including the Pi).** A static CSS
  overlay: gradient tint, brightness/saturation shift, recolored accents.
  Recomputed only when cached conditions change (every ~15 min), zero
  animation cost. This tier alone delivers most of the feel.
- **Tier 2 — ambient particles (capable displays, opt-in).** Raindrops,
  falling snow, drifting fog — CSS-transform animations, capped particle
  counts, `prefers-reduced-motion` respected. **Disabled on low-power
  displays** the same way backdrop-blur is (§7.8): the editor shows the
  control, the Pi renders Tier 1 instead. A wall display that meets the
  §7.8 idle budget is worth more than raindrops.
- **Lightning** is a Tier-2 effect implemented as a rare, brief flash overlay
  (a few frames, at most every few tens of seconds) — never a continuous
  loop. Real NWS *warnings* remain a separate, non-decorative full-bleed
  takeover per §6.4; ambiance must never be mistakable for an alert.

**Build point:** the mood layer is part of the theme system (Phase 3 tokens
carry it: a theme declares how it tints under each condition class), and it
activates when the weather connector lands (Phase 5). Condition classes:
`clear`, `partly`, `overcast`, `rain`, `storm`, `snow`, `fog`, `extreme-heat`,
`extreme-cold`.

### 7.8 Renderer performance budget — the Raspberry Pi is the target

At least one display is a **Raspberry Pi running Chromium in kiosk mode**. The
renderer targets the weakest screen in the house, not the best one. A board that
is smooth on a desktop and janky on the Pi is a board that has failed, because
the Pi is the one bolted to a wall.

**Baseline assumption: Raspberry Pi 4, 2 GB, Pi OS 64-bit, Chromium, 1080p
output.** If the actual unit is a Pi 3 or a Zero 2 W, several items below become
hard limits rather than guidance — see `open-questions.md`.

**Budget.** A board must hold **≤ 250 MB** of Chromium resident memory, idle
below **5% CPU** between refreshes, and repaint a data update in **under 100 ms**.
Idle cost matters far more than load cost: this page runs for thirty days without
a reload, so a small per-frame cost becomes the whole thermal budget.

**Rules that follow from that.**

- **No continuous animation loops.** No `requestAnimationFrame` ticking in the
  steady state. The clock widget updates via a `setTimeout` aligned to the next
  second boundary, then re-aligns — it does not poll at 60 Hz to render a value
  that changes once a second.
- **`backdrop-filter: blur()` is disabled on kiosk renders.** §7.3 offers it as a
  per-widget format option, and it is the single most expensive thing a user can
  put on a board — each blurred element forces a readback and re-composite every
  frame it is dirty. The editor keeps the control, warns when the target display
  is a low-power device, and the kiosk renderer degrades it to a flat
  semi-transparent surface. A user should not be able to make their wall display
  unusable through a formatting checkbox.
- **Shadows are capped**, not banned. Large-radius `box-shadow` across many
  widgets costs real paint time. Cap the radius and never place a shadow on
  anything that moves.
- **Images arrive pre-scaled.** The server resizes to the widget's canvas
  dimensions and serves modern formats. Decoding a 4000 px photo to paint it in a
  400 px panel wastes decode time and holds the full bitmap in memory. Handle
  this at fetch time in `worker`, alongside the §6.3 local cache.
- **Refresh swaps subtrees, not the document.** A widget receiving new data
  re-renders that widget. No full-page reload, no route transition — a reload
  means a fresh Chromium paint of the entire board, visible from across the room.
- **Fonts are local, subset, `woff2`.** Already required by §7.5 for offline
  reasons; on the Pi it is also a startup-cost decision.
- **Decorative theme layers are static.** The Deep space starfield and Chalkboard
  texture (§7.5) render as inline SVG once. They do not animate. A twinkling
  starfield is a permanent GPU load for a screen nobody is watching closely.
- **Compositing layers are budgeted.** Every `will-change` and every transformed
  element costs GPU memory the Pi does not have. The whole-canvas `transform`
  scale from §7.1 is the one that matters and it is cheap; additional promoted
  layers need justification.

**Operational.** Disable screen blanking and the screensaver. Launch Chromium
with `--kiosk --noerrdialogs --disable-infobars --disable-features=Translate`.
Long-running Chromium leaks regardless of what the page does, so the kiosk unit
restarts the browser nightly at a fixed hour — cheap insurance, invisible to
anyone asleep. The Pi setup is scripted and documented in `/docs/kiosk-pi.md`,
because it will be done more than once.

**This budget is testable and should be tested.** Phase 4 does not pass on a
developer laptop. It passes on the actual Pi, left running for two hours, with
memory checked at the end.

---

## 8. Security

### 8.1 Auth

**Passwordless — for members.** No family member has a password: no hashing,
no reset flow, no "forgot password" screen, no composition rules to explain to
your aunt. *Amended by ADR 0003 (2026-08-29): OPERATOR accounts additionally
carry a local bcrypt password login, so the operator can reach the admin UI
with zero cloud dependencies. The requirements and boundaries live in the ADR.*

- Invite: 32 random bytes, stored hashed, single-use, 7-day expiry, emailed via SES.
- Login: user enters their email, receives a magic link. Token is 32 random bytes, stored hashed, single-use, **15-minute expiry**, bound to the requesting IP's /24 as a soft check (log mismatches, don't hard-block — mobile carriers roam).
- Sessions: 90-day rolling, `httpOnly`, `Secure`, `SameSite=Lax`. At 90 days most people log in two or three times a year.
- Rate limit login requests by IP and by target address. Return an identical response whether or not the address exists — do not leak account existence.
- Operator role for account management. TOTP required on operator accounts, since email is now the sole factor for everyone else.

**Break-glass path.** Email is the only way in. If SES has an incident or the domain identity breaks, everyone is locked out. Ship a CLI command in the `web` container that mints a one-time login link for a given user and prints it to stdout. Five minutes of work, and it is the difference between an inconvenience and a rebuild.

**Token hygiene.** A magic-link token is a live credential in transit. Never log the full URL. Never include it in an error message. Consume it on first use even if the subsequent session creation fails.

### 8.2 Secrets at rest

Envelope encryption. Master key from a `0400` file owned by the service user, injected as an env var, never in the compose file, never in git. Per-connection data keys wrapped by the master key, AES-256-GCM.

User URLs are secrets. After save, the UI shows a masked form (`https://p01-calendars.icloud.com/…/a1b2`). Full plaintext never returns from the API, never lands in a log, never appears in an error message.

Ship a test that serializes every API response and fails if a known secret fixture appears in it.

### 8.3 SSRF defense — critical

The worker fetches arbitrary user-supplied URLs. Without controls it will happily fetch `http://169.254.169.254/`, `http://10.0.0.1/`, or anything else reachable from the operator's own host.

Required:

- Scheme allowlist: `https` and `webcal` only. No `http`, `file`, `gopher`, `ftp`, `data`.
- Resolve DNS first, then check the **resolved IP** against private, loopback, link-local, and reserved ranges. Checking the hostname is not sufficient — it is trivially bypassed by a hostname resolving to an internal address.
- Follow at most 3 redirects, re-validating the resolved IP at every hop.
- Response size ceiling (10 MB) and request timeout (15s).
- Egress allowlist at the container level for known API hosts; user URLs go through a separate egress path that still excludes RFC1918 space.

### 8.4 Headers and transport

TLS via Cloudflare. HSTS with a long max-age once the hostname is stable. CSP with nonced scripts and no `unsafe-inline`. `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, restrictive `Permissions-Policy`. CSRF protection on all state-changing routes.

### 8.5 Display tokens

- 32 bytes at pairing, stored hashed, scoped to one board, read-only.
- Pairing code is 6 digits, single-use, 10-minute expiry, rate-limited.
- Individually revocable with a visible last-seen timestamp, so a lost tablet is obvious.
- Revocation takes effect within one render cycle.

### 8.6 Exposure

**Cloudflare Tunnel.** `cloudflared` makes an outbound connection; nothing inbound is opened on your network. Cloudflare Access sits in front of the admin URL as a second gate if you want it.

The kiosk route needs an Access bypass policy — wall tablets cannot complete an interactive auth challenge. Scope that bypass to the kiosk path only, and lean on the device token for actual authorization.

Displays on your own LAN should hit the internal Caddy address directly and skip the tunnel entirely.

### 8.7 Containers

Unprivileged LXC, Debian 13, nesting enabled. Non-root UID in every container. `read_only: true` rootfs with explicit tmpfs mounts. `cap_drop: ALL`. `no-new-privileges: true`. Postgres and Redis on the internal Compose network only, never published to the host interface. Storage referenced by `/dev/disk/by-id` paths.

---

## 9. Deployment

**Container:** 4 vCPU, 8 GB RAM, 40 GB disk. Separate from the the operator's other project container.

**Backup:**
- Nightly `pg_dump --format=custom`, compressed, age-encrypted, to the Synology mount
- Photo cache and uploads synced nightly
- Retention: 30 daily, 8 weekly, 12 monthly
- Weekly `vzdump` of the container per existing host practice
- **A restore script that provably rebuilds a working instance from a backup file**, executed against a scratch container, documented in `/docs/restore.md`. Phase 1, not Phase 6.

**Observability:** structured JSON logs to stdout. `/healthz` and `/readyz`. A connector health page showing last success, last error, and next run per connection — when someone says "my calendar isn't showing," this answers it in five seconds.

---

## 10. Phases

Each phase ends deployable. Do not start a phase before the prior one's criteria pass.

> **v4 re-sequencing (2026-08-29, operator decision).** After Phase 0 shipped,
> the operator chose a design-first ordering: prove the editor/theme/renderer
> surface — where the design risk lives — before wiring email and connectors.
> The phase *contents* and done-criteria below are unchanged; the *order* is:
>
> - **Phase 1a — auth slice.** Operator password login (ADR 0003), sessions,
>   and the audit log. Just enough for boards to have a real owner behind a
>   real login. Magic-link, invites, TOTP, break-glass, and backup move to 1b.
> - **Phase 3 (pulled forward) — editor, themes, renderer.** Built against
>   boards owned by the operator's real account — no fixture data, tenancy
>   stays honest. The kiosk/admin CSS boundary applies from the first line.
> - **Phase 1b + Phase 2 — the rest of auth, then connectors.** Email,
>   invites, magic-link, TOTP, break-glass CLI, the backup with proven
>   restore, then the connector framework and ICS. **Hard gate: no family
>   member is invited until 1b's done-criteria pass — including the
>   cross-tenant isolation test and the restore drill.**
> - Phases 4–6 as written.
>
> The SES identity/credential decision moves with 1b and is no longer urgent.

**Phase 0 — Foundation.** Monorepo, strict TS, lint, Prisma schema for users/sessions/invites, Compose stack, CI typecheck and test.
*Done when:* `docker compose up` gives a working skeleton with a green healthcheck.

**Phase 1 — Auth, tenancy, backup.** SES identity and IAM principal provisioned, sandbox status confirmed, bounce/complaint SNS handler and suppression list. Invites, magic-link login, sessions, operator TOTP, break-glass CLI, audit log. Backup and **verified restore**.
*Done when:* two accounts exist and can log in by email, a simulated bounce lands in the suppression list, the break-glass command works, the cross-tenant isolation test passes, and a full restore has succeeded on a scratch container.

**Phase 2 — Connector framework + ICS.** Connector interface, envelope encryption, SSRF guard with its own test suite, BullMQ scheduler, payload cache, health UI. Generic ICS calendar as the reference implementation.
*Done when:* a pasted ICS URL fetches on schedule and normalized events land in the database, and the SSRF tests pass against internal-address payloads.

**Phase 3 — Editor, themes, renderer.** Board CRUD, free-canvas editor with drag/resize/snap/layers, token-based theme system with all 10 built-ins, stable `data-widget` hooks documented in `/docs/theming.md`, format panel, custom CSS with ingest validation and same-origin delivery. Widgets: clock, date, calendar, weather, quote, notes. Default board seeded on signup.
*Done when:* the reference layout can be rebuilt in the editor, all 10 themes render legibly against it, a custom stylesheet applies to the kiosk surface without weakening CSP, `@import` and off-origin `url()` are rejected on ingest, and "reset to theme" recovers a board whose CSS hides everything.

**Phase 4 — Displays.** Pairing codes, device tokens, kiosk route, browser-side offline cache, auto-reconnect, screen wake, revocation UI.
*Done when:* a paired tablet renders the board, survives a two-hour outage showing stale-but-labeled data, and goes blank within one cycle of revocation — **and the same board meets the §7.8 budget on the actual Raspberry Pi**, verified after two hours of uptime, not on a developer laptop.

**Phase 5 — Remaining sources.** Open-Meteo *(pulled forward — shipped with the Phase 3 slice)*, NWS alerts, RSS, photo URLs including Google Drive folders, stock backgrounds with attribution, the §6.6.1 stockpile with its manifest and seed script, and **wallpaper collections** (`docs/specs/wallpaper-collections.md`) with weekly rotation.
*Done when:* every source in Section 6 passes health check and renders, and a board with the network unplugged still shows stockpile backgrounds.

**Phase 6 — Hardening and handoff.** CSP tightening, security checklist pass, rate limit tuning, container hardening, tunnel configured, runbook written.
*Done when:* the checklist is green and a non-technical user completes onboarding unassisted.

---

## 11. v1.1 backlog

Google Calendar OAuth · passkeys · chores and rewards · meal planning · task lists · touch interaction · multi-page rotation · night mode and dimming · header-auth URL connectors · iCloud CalDAV · sports scores · board templates
