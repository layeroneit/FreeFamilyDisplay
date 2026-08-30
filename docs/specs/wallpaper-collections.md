# Wallpaper collections

**Feature specification — operator-authored, 2026-08-30. Target: Phase 5.**
Depends on: board renderer (Phase 3 ✅), connector framework + SSRF guard
(Phase 2), displays table (Phase 4), the token system.

> **Reconciliation notes (coordinator, 2026-08-30)**
>
> - The spec names tokens `--ffd-*`; the codebase currently uses `--hearth-*`
>   (a holdover from the plan's original project name). A rename to `--ffd-*` is
>   queued as a mechanical refactor before Phase 3 hardens — tracked in
>   `open-questions.md`. Read `--ffd-*` and `--hearth-*` as the same thing.
> - `displays` does not exist yet (Phase 4); the per-display overrides here land
>   with it. Board-level fields can land earlier.
> - BullMQ is not yet wired (the worker runs plain intervals). The
>   `wallpaper_rotation` repeatable job is the first thing that genuinely wants
>   BullMQ — it's the trigger to add it.
> - Operator add (2026-08-30): **NASA, anime, cars, and video games (Xbox, PC)
>   are all wanted.** Applying §6 of this spec: *Deep space* (NASA, public
>   domain) and *Muscle and machines* (free-license, no badges) ship built-in;
>   a built-in *Gaming* collection is feasible as **aesthetic only** — neon
>   rigs, RGB keyboards, arcade cabinets, logo-free controllers — never
>   franchise art or platform logos; **anime and game/franchise art are
>   copyrighted and arrive via "Add your own"**, same pipeline, surfaced next
>   to the built-ins per §6. No scraper, no franchise-term search.

---

## 1. What this is

A wallpaper collection is a curated set of 8–15 full-bleed photographs on a
subject a family cares about — space, muscle cars, the Northwoods, wildlife,
their own vacation photos. A board picks one collection. The wallpaper rotates
on a schedule, weekly by default.

This is the feature people show their friends. It's also the feature most
likely to make the product look broken if the compositing is wrong, because a
dashboard on top of an arbitrary photograph is unreadable unless you handle it
deliberately.

**Not to be confused with themes.** A theme is a color token set (`--ffd-bg`,
`--ffd-accent-1`, etc.). A wallpaper collection is photography that sits behind
everything. They're independent: any theme can pair with any collection.

---

## 2. The legibility problem

This is the whole engineering challenge. Everything else here is plumbing.

Four compositing layers, back to front:

1. **Wallpaper** — full bleed, `object-fit: cover`, sized to the display
2. **Scrim** — solid or gradient overlay, opacity derived from the image
3. **Widget panels** — translucent surface fill plus `backdrop-filter: blur(14px)`
4. **Text** — light or dark, chosen per image

### Derive the treatment at ingest, not at render

When a wallpaper is added, process it once with `sharp` and persist the results:

| Field | Purpose |
|---|---|
| `mean_luminance` | Light vs dark text decision, threshold at 0.5 |
| `luminance_variance` | Busy images need a heavier scrim than calm ones |
| `dominant_colors_json` | 5-swatch palette extracted from the image |
| `suggested_scrim_opacity` | Computed, then user-adjustable via slider |

A bright snowy field and a deep-space nebula need opposite treatments. A fixed
40% black overlay ruins one of them. Measuring beats defaulting — and it means
a user who uploads their own photo gets a readable board without touching a
single setting.

Suggested starting formula, tune against real images:

```
scrim = clamp(0.18, 0.62, 0.30 + (mean_luminance × 0.35) + (luminance_variance × 0.25))
text  = mean_luminance > 0.5 ? dark : light
```

Do not compute per-widget luminance sampling. It's tempting, it's expensive,
and a global scrim plus blurred panels solves 95% of it.

### Panel treatment

Widget panels sit on `--ffd-surface` at 65–80% opacity with
`backdrop-filter: blur(14px)`. The blur is what makes text readable over
detail; the opacity is what keeps the photo visible. Expose both in the board
format panel so someone can go full-transparent if their wallpaper is calm
enough.

`backdrop-filter` is well supported but expensive on low-power kiosk hardware.
Provide a per-display "reduce effects" toggle that swaps blur for a
higher-opacity solid fill. A Fire tablet will thank you. *(Coordinator: this
is the same degrade rule plan §7.8 already applies to backdrop-blur on the
Raspberry Pi — one toggle, one code path.)*

### Palette linking

Per-board toggle: **"Match colors to wallpaper."** When on, `--ffd-accent-1`
through `--ffd-accent-4` are populated from `dominant_colors_json` instead of
the active theme. When off, the theme's tokens win.

**Default off.** Auto-extracted palettes are unpredictable, and plenty of
families just want their team colors regardless of what's behind them.

---

## 3. Rotation

Per board, with a per-display override.

- **Interval:** daily, **weekly (default)**, monthly, or manual
- **Weekly fires Monday at 4am local**, so a new week greets people at breakfast
- **Order:** sequential, or shuffled without repeats until the set is exhausted
- **Transition:** 2-second crossfade if the change lands while a display is
  awake; instant if it was asleep
- **Mechanism:** a `wallpaper_rotation` BullMQ repeatable job advances the
  pointer and writes `current_wallpaper_id` to the board. Displays pick it up
  on their next poll — do not push.
- **Per-image actions:** "Pin this one" (stop rotating, hold here) and "Skip
  this one" (exclude from the set). Someone will love one photo and hate
  another, and both need to be one tap.

Rotation state lives on the board, not the display, so every screen showing
that board changes together unless a display explicitly overrides.

---

## 4. Ingest pipeline

Identical requirements to the login page. **Self-host everything. Never
hotlink.** Hotlinking leaks your users' IPs to a third party and breaks when
the source rate-limits you.

- Generate AVIF, WebP, and JPEG at 1920 / 2560 / 3840 widths
- Cap the 3840 AVIF at 600KB. Quality 55–65 is visually indistinguishable at
  wall-viewing distance.
- Strip EXIF on ingest — stock and personal photos carry camera and sometimes
  GPS metadata you have no reason to serve
- Generate a 24px base64 LQIP per image so the board is never briefly blank
- Displays request only the size they need. A 1080p tablet must never pull the
  4K asset.
- Reject anything under 1920px on the long edge with a clear message, not a
  silent failure

Write this as `/scripts/ingest-wallpapers.ts` so re-running after adding
photos is one command. *(Coordinator: `scripts/fetch-login-photos.mjs` is the
seed of this — same download/resize/strip/credits shape, minus the multi-format
ladder and the luminance analysis.)*

**Storage note:** 14 collections × 12 photos × 3 formats × 3 sizes is roughly
1,500 files. Point this at the Synology mount, not the container's root disk.
*(The LXC root is 48 GB after resize; the mount path is still an open
question — see `open-questions.md`.)*

---

## 5. Built-in collections

Sourced from Openverse, Wikimedia Commons, NASA, and Pexels — all free, no
credit card.

| Collection | Notes |
|---|---|
| Deep space | NASA and ESA imagery is public domain. Nebulae, Mars surface, astronauts, Earth from the ISS. Best-looking collection you'll ship and the cheapest to license. |
| Muscle and machines | Classic cars, dark garage shots, chrome and taillights. Avoid visible badges and logos. |
| Gaming *(added 2026-08-30)* | Aesthetic only: neon rigs, RGB keyboards, arcade cabinets, logo-free controllers. No franchise art, no platform logos. |
| Northwoods | Lakes, pines, snow, barns, fog. Regionally specific and genuinely calming. |
| Mountains | Alpine ranges, ridgelines, high country. |
| Ocean and coast | Surf, cliffs, harbors, tide pools. |
| National parks | US parks, wide landscapes. Heavy overlap with Wikimedia's public-domain holdings. |
| Wildlife | Horses, wolves, raptors, big cats. Strong with kids. |
| Cities at night | Skylines, neon, wet streets, long exposures. |
| Aviation | Vintage aircraft, cockpits, contrails, hangars. |
| Botanical | Macro flowers, greenhouses, ferns. |
| Cozy | Fireplaces, blankets, coffee, rain on windows. The winter default. |
| Fields and sport | Empty stadiums, chalk lines, courts, tracks. |
| Storms | Supercells, lightning, mammatus. Pairs with the NWS alert widget. |
| Abstract and texture | Paint, paper, macro material. The safe pick when photos fight the widgets. |

### Selection criteria

- Wide compositions with a calm region where widgets can sit. A photo with
  detail edge to edge fights the dashboard no matter how good the scrim is.
- Avoid images with a strong subject dead center — that's where the calendar
  goes.
- Reject anything with visible text, watermarks, or logos.
- Minimum 2560px on the long edge before processing; prefer 4000px+.
- Attribution stored per image in `attribution_json`: photographer, source,
  license, source URL.

---

## 6. Licensing constraints

**Built-in collections must be free-license only.** Openverse and Wikimedia
are CC-licensed and require attribution. Pexels and Unsplash allow commercial
use but neither verifies model releases, and Pexels' license prohibits implying
endorsement by people in the imagery. NASA imagery is public domain and is the
cleanest source available.

For collections with people, prefer wide shots and figures that aren't the
focal point. This sidesteps the release question and looks better on a wall
anyway.

**Anime, film, and franchise collections are user-supplied, not built in.**
Real anime frames, movie stills, character art, team logos, and album covers
are copyrighted. Free Family Display cannot bundle or redistribute them.

The user-supplied path covers this completely — paste a share URL or upload
files and the same ingest pipeline runs. Surface **"Add your own"** directly
next to the built-in list, not buried in settings.

**Do not build a scraper.** Do not add a search that queries image sites for
franchise terms. Do not add a "find me anime wallpapers" button. The upload
path is the answer.

> **Operator override, 2026-08-30 — a tag-fed anime source ships.** Asked for a
> fourth time, with specific APIs named. Implemented as
> `apps/worker/src/connectors/anime-booru.ts`: the operator types tags, and
> their own instance fetches matching images onto their own media volume.
>
> The line above still holds where it matters, and is now *harder*, because the
> repo is public: **nothing is committed and nothing ships in the image.** What
> changed is the acknowledgement that a family fetching art onto their own
> machine for their own wall is not this project redistributing it. Each image
> keeps a link back to its artist, and the collection carries a rights note that
> renders on screen.
>
> Of the three APIs proposed, only **Safebooru** is fit for purpose: it returns
> `width`/`height` in the listing, so the connector filters for wall-sized
> images *before* downloading. `nekosapi.com` returns no dimensions at all and
> serves portrait character art; `api.nekosia.cat` returns dimensions but its
> whole catalogue is portrait/square character art; `nekos.best` is behind a
> Cloudflare bot challenge and cannot be reached from a headless box.
>
> **Two things to be honest about, in the code and in the UI.** The index's
> rating is crowd-tagged, not verified — it reliably excludes sexual content and
> does *not* reliably exclude gore or violence, so `rating:general` plus a fixed
> blocklist is applied to every query *and* re-checked on every result before
> download. And the images are unlicensed reposts of artists' work; the index
> claims no rights and carries no licence field. This is a private-display path,
> not a licensed source, and the copy on screen says so.

---

## 7. Custom collections

Any user can create a collection from uploads or a source URL, name it, and
set it as their board's wallpaper source.

This is the version of the feature that matters most. "Grandma's garden," "the
2019 Colorado trip," "Caiden's robotics season" — these are what turn a
dashboard into something a family cares about. Built-in collections are the
demo; custom collections are the reason it stays on the wall.

- Upload: drag and drop, multi-file, progress indicator, per-user storage quota
- URL: any source the photo connector already supports — iCloud shared albums,
  Immich, Synology Photos, Nextcloud public shares
- URL-sourced collections re-sync on a schedule, so adding a photo to the
  shared album adds it to the board
- Same SSRF protections as every other user-supplied URL. Resolved-IP
  validation, not hostname validation.
- Collections are private to their owner in v1.0. Sharing between accounts is
  v1.1 and needs its own review.

---

## 8. Data model

```
wallpaper_collections
  id, owner_id (null for built-ins), name, description,
  is_builtin, source_url, last_synced_at, created_at

wallpapers
  id, collection_id, local_path, width, height,
  mean_luminance, luminance_variance, dominant_colors_json,
  suggested_scrim_opacity, lqip, attribution_json,
  pinned, skipped, created_at

boards  (additions)
  wallpaper_collection_id, wallpaper_rotation, wallpaper_order,
  current_wallpaper_id, last_rotated_at, scrim_opacity_override,
  match_palette_to_wallpaper

displays  (additions)
  wallpaper_collection_override, reduce_effects
```

Tenancy: collection queries scope by `owner_id` OR `is_builtin = true`. Add a
test asserting user A cannot read user B's custom collection or its wallpapers
by direct ID.

---

## 9. Acceptance criteria

- A board set to any built-in collection stays legible across every wallpaper
  in that collection with no manual adjustment
- Weekly rotation advances correctly across a simulated month, including the
  shuffle-without-repeat path
- A user uploads 10 personal photos of mixed exposure and gets a readable board
  without touching the scrim slider
- Pin holds the current wallpaper through a rotation tick; skip removes it from
  the cycle permanently
- A 1080p display never requests a 3840px asset — verify in the network tab
- Reduce-effects mode renders without `backdrop-filter` and remains legible
- Cross-tenant isolation test passes for collections and wallpapers
- Attribution renders for every CC-licensed built-in image

---

## 10. Do not

- Do not hotlink to Pexels, Unsplash, or any third-party image host at render
  time
- Do not compute per-widget luminance sampling — global scrim plus panel blur
  is sufficient and far cheaper
- Do not auto-switch collections by date or season. People pick a collection
  because they like it.
- Do not ship a scraper or a franchise-term image search **as a built-in
  collection or committed asset** — see the operator override in §6 for the
  user-created, fetched-to-your-own-box path that does ship
- Do not push wallpaper changes to displays. They poll.
- Do not default palette-matching to on
