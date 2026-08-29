# FreeFamilyDisplay — Project Charter

**Status:** Active · **Owner:** operator of the operator's own host · **Started:** 2026-08-29

This document says why the project exists and who it is for. The build
specification is `project-plan.md`; the two are meant to be read together, and
when a technical decision in the plan seems arbitrary, the reason is usually
here.

---

## 1. Why this exists

The household currently pays **Mango Display** to put calendars, weather, and
photos on wall screens. It is a per-screen commercial product. At roughly fifteen
screens across a family, that is a recurring cost for something the household can
own outright, and it puts family calendar data on someone else's servers.

The goal is to replace it with a free, self-hosted equivalent running on hardware
that is already paid for.

Cost is the trigger. It is not the only reason:

- **The data is family calendar data.** Where everyone is, when, with whom. It
  should live on a machine in the house.
- **The screens should outlive the vendor.** A product can change its pricing,
  its terms, or shut down. A dashboard on the kitchen wall should not be exposed
  to any of that.
- **Nobody should need an account with a company to see the family calendar.**

## 2. Who it is for

**Primary: family and friends who are not technical.** Roughly ten people. They
are not going to read documentation, file a bug report, or work around a rough
edge. Several will interact with it exactly twice — once at setup, once when
something breaks — and the rest of the time it is just a screen on the wall that
is either right or wrong.

The person this is designed for is best described concretely:

> Your sister gets an invite email. She clicks it. She pastes her iCloud calendar
> share URL into one text box. She drags four widgets onto a board. She taps
> "Pair display" and types a six-digit code into the tablet in her kitchen. She
> walks away.
>
> **Thirty days later it is still correct. She never created a password, because
> there isn't one.**

That paragraph is the acceptance test for the whole project. When a design
question is genuinely close, the tiebreaker is which answer keeps that story
true.

**Secondary: the operator.** One person maintains this, in spare hours, alongside
another live application. It has to be boring to run. Anything requiring monthly
attention is a design failure, not a maintenance task.

**Not for:** the public, customers, or anyone who arrives without an invite.
There is no growth goal. Ten accounts is not a starting point to be exceeded, it
is the size of the thing.

## 3. What success looks like

1. Mango Display is cancelled and nobody notices a downgrade.
2. A non-technical family member completes setup without help.
3. A wall display runs for thirty days untouched and shows correct information.
4. When a feed breaks, the screen shows stale-but-labeled data rather than an
   error or a blank panel.
5. The operator does not think about it for weeks at a time.

Number 4 deserves emphasis. A wall display is ambient — people stop consciously
reading it and start trusting it. Silently wrong is far worse than visibly stale,
because a screen nobody questions is a screen that misinforms.

## 4. Non-goals, and why

These are permanent. They are listed with reasons so that a future contributor
does not read them as gaps waiting to be filled.

**No public signup.** Invite-only, always. Every account belongs to someone known
personally. This removes abuse handling, spam, moderation, and most of the
compliance surface that makes small apps expensive to run.

**No billing.** The moment money changes hands, this becomes a product with
obligations — support, uptime promises, refunds, tax. It is not a product.

**No telemetry, analytics, or third-party crash reporting.** Nothing about how a
family uses their own wall display leaves the house. This rules out Sentry and
equivalents by design, not by oversight.

**No operator access to user data.** The operator manages accounts — creates,
disables, deletes. The operator cannot read another person's calendar contents.
This is the difference between hosting something for family and surveilling them,
and it constrains the admin tooling permanently.

**No native mobile apps.** The admin UI is a responsive PWA. Native apps mean app
store review, signing certificates, and release cycles for a ten-person tool.

## 5. Relationship to the operator's other project

The operator also maintains **the operator's other project**. The two share a technology stack, a
Proxmox host, and an AWS SES account. They share no code.

This was decided deliberately after reviewing Tag (see plan §4.5). Tag is
password-based, sells subscriptions, serves minors, and by necessity grants
operators moderation visibility into user content. Every one of those is
something FreeFamilyDisplay specifically does not do. Merging them would mean
either abandoning the non-goals above or maintaining permanent exceptions to
them.

Family sharing between the two works over a URL instead: Tag already publishes
calendars as ICS behind revocable share links, and this app consumes ICS URLs as
its primary calendar path. A Tag user's calendar reaches the kitchen wall without
either codebase importing the other.

## 6. Constraints that shape the design

**The screens are cheap and varied.** Old tablets, a spare monitor, and at least
one Raspberry Pi. The renderer targets the weakest of these, not the best. See
plan §7.8.

**A pasted URL is a password.** An unlisted iCloud calendar link grants
permanent read access to anyone holding it. Users will paste these into a text
box without thinking of them as credentials. The system must treat them as
credentials regardless.

**Email is the only way in.** Passwordless is the right call for this audience,
but it means an SES outage locks everyone out. Hence the break-glass CLI in plan
§8.1 — it is five minutes of work and the difference between an inconvenience and
a rebuild.

**The host has lost storage before.** Backups with a *proven* restore ship in
Phase 1, not at the end. An untested backup is a belief, not a backup.

**One maintainer, spare hours.** This is why the stack matches Tag's, why
dependencies require justification, and why "boring and well-maintained" beats
"best in class" every time.

## 7. Decision log

| Date | Decision | Where |
|---|---|---|
| 2026-08-29 | Ubuntu 24.04 VM instead of unprivileged LXC | `adr/0001-vm-over-lxc.md` |
| 2026-08-29 | Standalone app; does not merge into the operator's other project | plan §4.5 |
| 2026-08-29 | Adopt Tag's stack — Next 16, Prisma 7, Tailwind v4, hand-rolled sessions | plan §4.1 |
| 2026-08-29 | Keep Redis + BullMQ despite Tag not having a queue | plan §4.1 |
| 2026-08-29 | npm workspaces rather than pnpm | plan §4.3 |
| 2026-08-29 | Raspberry Pi is the renderer's baseline target | plan §7.8 |
| 2026-08-29 | Deployed to the existing LXC, superseding the VM decision | `adr/0002-lxc-by-operator-decision.md` |
| 2026-08-29 | Operator accounts get a local password; family stays passwordless | `adr/0003-operator-password-login.md` |
