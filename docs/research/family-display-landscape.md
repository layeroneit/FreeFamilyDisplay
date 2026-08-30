# Family display landscape — what the neighbors ship

Research pass, 2026-08-30, requested by the operator before the widget catalog
and setup flow were designed. Marketing/design doc: product names are fine here;
they stay out of code.

## The products

**Mango Display** (the incumbent this project replaces) — per-screen SaaS.
Widgets: clock (analog/digital), weather (now + 24h + 5-day), news headlines,
rotating Unsplash backgrounds, daily quote, calendar (Google/Outlook/Apple/Cozi/
any ICS, color per source, list/week/month views), tasks (Google Tasks/MS To Do/
Todoist), custom notes, meal plan, chores & rewards, countdown, photo albums
(Google/iCloud), docs/PDF/website embeds, video. Onboarding is three steps:
install on screen → sign in → "add widgets and arrange your layout" in a
drag-and-drop editor where you "tap, drag, and resize widgets directly on
screen." Multiple pages rotate on timers; night mode dims on a schedule;
landscape and portrait.

**MagicMirror²** — open-source, Raspberry Pi-native. Seven default modules:
clock, calendar, weather, newsfeed, compliments, helloworld, alert. Layout is
region-based (top_left, top_bar, bottom_right …) rather than free canvas; ~1000
third-party modules, config lives in a JS file. Its lesson is the opposite of
Mango's: total flexibility, zero approachability — nobody's aunt edits
`config.js`.

**DAKboard** — closest in spirit to this plan's editor: drag-and-drop custom
screen editor with resizable blocks, predefined templates for quick starts,
multiple screens (different content by time of day), landscape/portrait.
Sources: calendars (Google/iCloud/M365/ICS), weather, photos (Google/Flickr/
Dropbox/iCloud/OneDrive), to-dos, news, stocks, traffic, smart-home. Pitch is
"set it and forget it."

**Skylight Calendar / Hearth Display** — hardware-first ($600–700 + subscription).
Kid-centric: chores, routines, rewards, meal plans, "magic import" of school
emails; two-way Google sync. Their differentiator is *family workflow*, not
display flexibility. Consumer Reports and reviewers frame Skylight as
parent-first, Hearth as young-kid-first, DAKboard as tinkerer-first.

## What families actually put on the wall

Every product converges on the same core seven, in roughly this priority:

1. **Calendar** — the reason the screen exists; week view dominant
2. **Clock + date**
3. **Weather** — today + short forecast
4. **Photos** — the thing that makes it *theirs*
5. **Notes / message board**
6. **To-dos or chores**
7. **Quote / greeting** — the "warmth" slot

Countdowns, meal plans, and news are the common second tier. Embeds, docs, and
dashboards are the enterprise tail Mango sells to offices — not this project.

## Decisions this drove

- **Widget catalog v1** (plan §7.2, confirmed): clock, date, greeting, weather,
  calendar, photos, quote, notes. Adds from research: **countdown** and
  **to-do** enter the Phase 3 backlog as the first post-v1 widgets; chores &
  rewards are a v1.1 candidate if the family wants them.
- **Setup flow mirrors the pattern every product shares:** pick a look → add
  widgets → arrange → pair a screen. Ours: choose theme → choose widgets from a
  catalog (sensible defaults pre-ticked) → land in the editor with a starter
  layout, never a blank canvas (plan §7.7 already requires this).
- **Free canvas over regions** — DAKboard/Mango's model, not MagicMirror's.
  Already the plan (§7.1). Templates cover the "I don't want to arrange
  anything" case.
- **Multiple boards per account, not multiple pages per board** for v1 —
  simpler to reason about; page rotation can come later.
- **Night dimming** is worth adopting (Mango, DAKboard): a per-board quiet-hours
  setting that drops brightness on the kiosk. Cheap, and a wall screen at 3 AM
  is a real complaint. Backlog for Phase 4.
- **Weather-reactive ambiance (§7.7.5) is a genuine differentiator** — none of
  the four ship it.

Sources: mangodisplay.com/features, docs.magicmirror.builders/modules,
dakboard.com, thequalityedit.com (Hearth vs Skylight 2026), consumerreports.org
digital-calendars roundup, mccagues.com Skylight alternatives.
