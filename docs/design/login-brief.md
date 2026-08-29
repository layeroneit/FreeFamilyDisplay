# Login page — Phase 1a design brief

**Status:** Approved by operator, 2026-08-29 · **Auth model:** ADR 0003 (password
login) · **Plan slot:** Phase 1a, design-first v4 ordering

The operator supplied an external brief and then explicitly overrode its
passwordless premise. This document is the reconciled version — build from
here, not from the original. The first thing anyone sees should feel warm and
a little joyful, not like enterprise software.

## The form — password login, per ADR 0003 and operator override

- Email field (`type="email"`, `autocomplete="email"`, `inputmode="email"`)
  and password field (`autocomplete="current-password"`). That's it.
- No social login, no "remember me," no CAPTCHA (rate limiting handles abuse
  and CAPTCHA punishes your grandmother), no password strength meter on login.
- Identical error for wrong password and unknown email: "Email or password
  didn't match." Never reveal whether an account exists. Not optional.
- Rate limited per ADR 0003; lockout message: "Too many tries. Wait a few
  minutes and try again."
- Built so the Phase 1b magic-link flow can replace or sit beside the
  password field without a redesign.

## Voice and copy — bright, fun, family

- Heading: **"Welcome home"**
- Tagline under it, operator's words: **"Finally, a free family calendar
  that is customizable and easy to use."**
- Footer, muted: "FreeFamilyDisplay is invite only. Ask whoever set up your
  board."
- Playful is good; corporate is a bug. If a line would fit a bank's login
  page, rewrite it.

## Layout

- Split screen 50/50 on desktop. Left: white (`#FFFFFF`) form panel, column
  max-width ~380px, vertically centered. Right: full-bleed rotating family
  photography, `object-fit: cover`.
- Slideshow: 7s hold, 1.2s crossfade, optional Ken Burns 1.0 → 1.06, subtle
  position dots bottom center, photographer credit bottom left (small, low
  opacity, **never removable** — license obligation per CLAUDE.md).
- Below 1024px: photo becomes a 240px banner above the form. Below 640px:
  photo hidden entirely — no 4MB image on cellular.

## Photography

- Source: Pexels / Unsplash, hand-picked, **downloaded at build time and
  self-hosted**. Never hotlinked at render (web makes no outbound calls).
- Search: "family kitchen morning," "grandparents grandchildren," "family
  cooking together," "kids backyard," "multigenerational family home."
- Candid and warm, wide shots, hands, backs turned, over-the-shoulder — the
  moment matters more than the faces. Reject anything that looks like a
  pharmaceutical ad. Warm natural light; cool tones fight the white panel.
- 6–8 images, ≥2560px long edge before processing. Recognizable faces must
  not be the focal point (Pexels/Unsplash licensing: no implied endorsement,
  no model-release verification).
- `public/login/credits.json`: photographer, source, license, URL per image.

## Image pipeline — non-negotiable

- Processing script `scripts/build-login-images.ts` using `sharp` (already a
  dependency): AVIF/WebP/JPEG at 1280/1920/2560/3840, `<picture>` + `srcset`.
- ≤200KB AVIF at 1920w (quality 55–65). Strip EXIF on ingest.
- Preload slide one only; lazy-load the rest; don't start rotation until
  slide two has decoded. Inline ~24px LQIP blur per image.

## Accessibility and motion

- `prefers-reduced-motion: reduce` → single static image, no crossfade, no
  Ken Burns. Required.
- Text over photos gets a scrim holding 4.5:1. Real `<label>` elements.
  Visible focus rings. Keyboard-only completion. State changes announced via
  `aria-live="polite"`.

## Theme and type

- Ships in light Kraft against the existing `--hearth-*` tokens (all 10
  themes already live in the repo — see `/themes`). Page background pure
  white; CTA button `#101B33` fill with `#FFD23F` label (Midnight pairing,
  previewing the default board theme). Body `#2E2A22`, muted `#7A7263`,
  hairlines `#E5E3DD`.
- Display face for heading/wordmark (Fraunces or Bricolage Grotesque), Inter
  for body. Bundled locally under `public/fonts`, `font-display: swap`. No
  runtime Google Fonts.

## States

Idle · submitting (spinner, inputs disabled) · wrong credentials (identical
message, see above) · rate limited · invalid email format (inline, on blur)
· arriving from a valid invite ("Welcome to FreeFamilyDisplay", inviter's
name if available).

## Build notes

- This repo is **Next.js 16** — read `node_modules/next/dist/docs/` before
  writing App Router code; conventions differ from training data.
- No custom CSS injection on this page, ever (admin surface). No
  `unsafe-inline`; nonce anything dynamic.
- Deliverables: `apps/web/app/login/page.tsx` + client components,
  `apps/web/components/auth/PhotoSlideshow.tsx`,
  `scripts/build-login-images.ts`, `apps/web/public/login/` + credits,
  Playwright coverage: submit → error and success paths, rate-limit state,
  reduced-motion rendering, keyboard-only completion.
