# Free Family Display

Put your family's calendars, the weather, your photos, and a few notes on a screen on the wall. Because answering "what are we doing this weekend?" for the fifth time is exhausting.

You run it. It lives on a computer in your house. Nothing is sold, nothing is tracked, and there is no account anywhere but your own machine.

**It costs nothing. It will always cost nothing.** There is no paid tier, no trial, no "pro" version, and nothing to unlock. There is also nobody to bill you, because there is no company here. We don't want your money, and we definitely don't want your data.

---

## Table of contents

- [Is this for you?](#is-this-for-you)
- [What you need](#what-you-need)
- [Quick start](#quick-start)
- [The `.env` file, line by line](#the-env-file-line-by-line)
- [HTTPS on your home network](#https-on-your-home-network)
- [Putting a board on a wall screen](#putting-a-board-on-a-wall-screen)
- [Backups](#backups)
- [Updating](#updating)
- [Troubleshooting](#troubleshooting)
- [What this is not](#what-this-is-not)
- [Honest limitations](#honest-limitations)
- [License](#license)

---

## Is this for you?

**Yes, if** you want a wall display for your household's calendars and photos, you have a computer that can stay switched on, and you are willing to copy and paste about eight commands into a terminal once while feeling like a hacker.

**Probably not, if** you have never used a terminal and have nobody to help. This is not an app you install from a store. Someone has to set it up. After that it is a normal website that everyone in the house opens on their phone.

### Who should avoid this app?

1. **Definitely not for you**, if you want somebody else to host it. The cloud is just someone else's computer. This runs locally on your own hardware.
2. **Hard pass**, if you want your family's schedule sitting in an unencrypted database three time zones away, waiting patiently to be harvested by advertisers. 
3. **Close this tab immediately**, if you expect a "Customer Success Journey." There are no drip marketing campaigns, no cookie consent popups, and no desperate nudges because you haven't clicked a button in four days. It just tells you what day it is.
4. **Abandon all hope**, if you want an SLA or technical support. You are the Tier 1, Tier 2, and Tier 3 engineer of this household. When the screen goes dark, the angry support tickets will be submitted verbally by your wife and kids in the living room. You're the one pulling the Docker logs. Godspeed.

---

## What you need

### 1. A computer that stays on

The server has to be running whenever you want the wall screen to update. Any of these is fine:

- A mini-PC (an old Intel NUC, a refurbished office desktop — these are cheap)
- A NAS that runs Docker (Synology, QNAP, Unraid)
- A virtual machine on a home server (Proxmox, Hyper-V, VMware)
- An old laptop with the lid-close action set to "do nothing"

Rough sizing: **2 CPU cores, 4 GB of RAM, and 20 GB of free disk** is enough for a family. More photos means more disk. It has been developed and run on a 4-core / 8 GB / 40 GB Ubuntu VM, which has plenty of headroom.

### 2. Docker

Docker Engine plus the Compose plugin. On Ubuntu or Debian, follow Docker's own [install guide](https://docs.docker.com/engine/install/) — use Docker's repository, **not** the `snap` package, which puts files in different places than everything here expects.

On a NAS, Docker is usually a package you install from the vendor's app store.

### 3. A screen

A TV or monitor with something to drive it. A **Raspberry Pi** is the classic choice and is well supported — see [`docs/runbook-pi-kiosk.md`](docs/runbook-pi-kiosk.md) for the full walkthrough, including how to rotate it into portrait. A cheap Android tablet, an old iPad, or a spare laptop propped behind the TV all work too; anything with a browser that can be left on one page.

### Should the Raspberry Pi also run the server?

**No — use a different machine if you have one.** Two honest reasons:

1. **microSD cards die under database write load.** Postgres writes constantly. A card that is fine for a browser kiosk will corrupt itself in months as a database host, and it will take your calendar data with it.
2. **Nothing here has been tested on ARM.** The images should build (the base images all have ARM builds), but nobody has run it in anger, and you would be the first to find out what breaks.

If a Pi is genuinely all you have: a **Pi 5 with 8 GB of RAM booting from a USB SSD** — not a memory card — is the only configuration worth attempting, and you should take [backups](#backups) seriously from day one. A Pi 4 or anything booting from microSD is not worth your evening.

**The Pi is an excellent *display*.** That part is well trodden and documented. It is the *server* role that wants a different box.

---

## Quick start

Roughly fifteen minutes, most of it waiting for Docker to build.

### 1. Get the code

```bash
git clone https://github.com/layeroneit/FreeFamilyDisplay.git
cd FreeFamilyDisplay
```

### 2. Make your settings file

```bash
cp .env.example .env
chmod 600 .env
```

### 3. Generate your secrets

These are passwords the software uses to talk to itself and to encrypt the calendar links you paste in. **Do not invent them by hand** — run these three commands and paste each result into `.env`:

```bash
openssl rand -hex 24      # -> POSTGRES_PASSWORD
openssl rand -base64 32   # -> MASTER_KEY
openssl rand -base64 32   # -> SESSION_SECRET   (run it again — a DIFFERENT one)
```

> If `openssl` is missing, `head -c 32 /dev/urandom | base64` does the same job.

Nobody but you will ever see these. If you lose `MASTER_KEY`, the encrypted calendar links in your database become unreadable and have to be pasted again.

### 4. Fill in the rest of `.env`

See [the line-by-line list below](#the-env-file-line-by-line). The short version: find your machine's IP address on your home network (`ip addr` on Linux, `ipconfig` on Windows) — say it is `192.168.1.50` — then set:

```
APP_URL=https://192.168.1.50:8443
SITE_HOST=192.168.1.50
TZ=Europe/London          # your own timezone — see step 4 below
DATABASE_URL=postgresql://ffd:THE-HEX-PASSWORD-FROM-STEP-3@postgres:5432/ffd
POSTGRES_USER=ffd
POSTGRES_PASSWORD=THE-HEX-PASSWORD-FROM-STEP-3
POSTGRES_DB=ffd
REDIS_URL=redis://redis:6379
MASTER_KEY=...
SESSION_SECRET=...
```

Three things people get wrong here, every time:

- **The database host is `postgres`, not `localhost`.** That is the name of the container. `localhost` will not resolve from inside.
- **The password appears twice** — in `POSTGRES_PASSWORD` and again inside `DATABASE_URL`. They must match exactly.
- **`TZ` must be your timezone**, written as an [IANA name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones#List) like `Europe/Berlin` or `America/Denver`. Get it wrong and everything looks fine until the evening, when the wall display starts showing *tomorrow's* date. See [Troubleshooting](#troubleshooting).

Leave everything else blank. **You do not need an AWS account, an email provider, a domain name, or a Cloudflare account.**

### 5. Start it

> **Faster option.** From **v1.0.0** there are pre-built images for amd64 and
> arm64, so you can skip the build entirely — add one flag:
>
> ```bash
> docker compose -f infra/compose.yaml -f infra/compose.images.yaml \
>   --env-file .env up -d
> ```
>
> `infra/compose.images.yaml` ships with the project; you do not have to write
> it. Minutes of building become one pull. Building from source, exactly as
> written below, always works too — and is what you want if you have changed
> any code.

```bash
docker compose -f infra/compose.yaml --env-file .env up -d --build
```

The first build takes a while. **Database migrations run by themselves** — a one-shot `migrate` container applies them and the app waits for it, so there is no separate command for you to remember.

Check on it:

```bash
docker compose -f infra/compose.yaml --env-file .env ps
```

Give it two minutes. Containers show `health: starting` at first; that is normal. You want `postgres`, `redis`, `web` and `worker` to reach `healthy`, and `migrate` to show `exited (0)` — it has done its job. `caddy` stays at `Up` rather than `healthy`; it defines no healthcheck, and that is not a fault. `cloudflared` should not be running at all; it only starts if you deliberately ask for it.

### 6. Open it and create your account

Go to `https://192.168.1.50:8443` (your own address) in a browser.

Your browser will warn you that the connection is not private. **That is expected** — see [HTTPS on your home network](#https-on-your-home-network). Click through it for now.

You will land on a **welcome page that only exists once**. Fill in your name, an email address, and a password, and the instance is yours. The moment that account exists, the page stops existing — visit it again and you get a 404.

Two things about that form:

- **The email is just your username.** Nothing is ever sent to it. This software has no way to send mail at all, so `dad@home` works as well as a real address. Use something you will remember typing.
- **The password protects a box on your own network**, not a bank account. Twelve characters minimum, and a short sentence beats a clever short word. Pick something you will actually remember: **there is no reset email**, and recovering a forgotten password means running a command on the server (see [Troubleshooting](#troubleshooting)).

You are in. Click **Set up a display** and build your first board.

---

## The `.env` file, line by line

| Variable | Must change? | What it is |
|---|---|---|
| `APP_URL` | **Yes** | The full address you type in the browser, e.g. `https://192.168.1.50:8443`. Include `https://`. Two things depend on getting this exactly right: whether login cookies work at all, and whether your [wall screen links](#putting-a-board-on-a-wall-screen) come out with the right address in them. |
| `SITE_HOST` | **Yes** | Just the host part — `192.168.1.50`. The HTTPS certificate is issued for this name. |
| `TZ` | **Yes** | Your timezone, IANA format. Wrong values are silent until evening. |
| `DATABASE_URL` | **Yes** | `postgresql://USER:PASSWORD@postgres:5432/DBNAME`. Host is `postgres`. |
| `POSTGRES_USER` / `POSTGRES_DB` | **Yes** | Any name; `ffd` is fine for both. |
| `POSTGRES_PASSWORD` | **Yes** | From `openssl rand -hex 24`. Hex on purpose — `/` and `+` from base64 would need escaping inside `DATABASE_URL`. |
| `REDIS_URL` | **Yes** | `redis://redis:6379`. Just paste that. |
| `MASTER_KEY` | **Yes** | Encrypts the calendar and photo links people paste in. Lose it and those links must be re-entered. |
| `SESSION_SECRET` | **Yes** | Reserved for signed cookies. Sessions are currently opaque random tokens stored hashed, so changing this does **not** log anyone out — delete the rows in the `Session` table for that. Still required, still generate a real one. |
| `NODE_ENV` | No | Leave as-is. |
| `AWS_REGION`, `SES_*` | **No — leave empty** | There is no email in this software. Nothing reads these. See [What this is not](#what-this-is-not). |
| `PEXELS_API_KEY` | **No — leave empty** | Reserved, and currently read by nothing. The wallpapers that ship are the wallpapers you get. |
| `GOOGLE_API_KEY` | No | Optional. Lets you point a photo widget at a public Google Drive folder. Everything else about photos works without it. |
| `CLOUDFLARE_TUNNEL_TOKEN` | No | Only if you want the display reachable from outside your house. Off unless you explicitly ask for it. |

---

## HTTPS on your home network

The stack serves HTTPS on port 8443 using a certificate it issues to itself (via [Caddy](https://caddyserver.com/)'s internal certificate authority).

This means **your browser will warn you the first time**, on every device. Nothing is wrong. The warning means "nobody famous vouched for this certificate", which is true — your own server made it. The alternative is sending your password across your home network in plain text, which is worse.

You have two options:

**Option A — click through the warning.** Fine for a phone you use occasionally. You will see it again from time to time.

**Option B — install the certificate once, and the warnings stop.** Worth doing for the wall screen especially, because an unattended kiosk that stops on a warning screen is a kiosk showing nothing.

The exact commands to export the certificate and install it live in [`docs/runbook-pi-kiosk.md` § "Trust the self-signed certificate on the Pi"](docs/runbook-pi-kiosk.md#2-trust-the-self-signed-certificate-on-the-pi). That section also explains why a Linux machine needs it installed in **two** places — Chromium keeps its own certificate store and ignores the system one.

> ⚠️ **Known gap.** Those instructions cover **Linux only**. There are no written steps yet for Windows, macOS, Android, or iOS, and iOS in particular needs two steps (install the profile, then separately enable full trust under Settings → General → About → Certificate Trust Settings). On those devices, click through the warning for now. Contributions welcome.

Do **not** work around this by launching browsers with `--ignore-certificate-errors`. That turns off certificate checking for every site the browser visits, including the page where you type your password.

---

## Putting a board on a wall screen

A wall display should not be logged in. It sits in a hallway, nobody ever logs it out, and a signed-in browser there carries the whole admin interface with it.

So each board can mint its own private link instead:

1. Sign in and open the board you want to show.
2. Find the **Wall screen link** panel and click **Create link**.
3. Copy the URL. **It is shown once and never again** — if you lose it, click **Replace link** to make a new one.
4. Open that URL on the wall screen and leave it there.

The link looks like `https://192.168.1.50:8443/d/<a long random string>`. It shows exactly one board, read-only, with no menus and no way to navigate anywhere else, and it refreshes itself every five minutes. No sign-in involved.

Treat the URL like a key: anyone who has it can see that board. **Replace link** instantly kills the old one on every screen using it; **Turn off** removes it entirely.

For a Raspberry Pi set up as a permanent kiosk — autostart, hiding the mouse pointer, disabling screen blanking, rotating to portrait — follow [`docs/runbook-pi-kiosk.md`](docs/runbook-pi-kiosk.md), using the `/d/…` link as the URL.

---

## Backups

**Nothing is backed up for you. There is no cloud copy of anything.** If the disk dies, your calendars, boards, and photos die with it, and you will have to look your family in the eyes and explain why their digital life is gone. 

Two Docker volumes hold everything that matters:

- **`ffd_pgdata`** — the database: accounts, boards, widget layouts, and your encrypted calendar and photo links.
- **`ffd_media`** — uploaded and cached images.

And one file outside Docker:

- **`.env`** — specifically `MASTER_KEY`. Without it, a restored database still has your calendar links, but they cannot be decrypted. Keep a copy somewhere other than the server.

A database dump, run on the machine:

```bash
docker compose -f infra/compose.yaml --env-file .env exec -T postgres   sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > ffd-backup-$(date +%F).sql
```

(The `sh -c '...'` and the single quotes matter: `$POSTGRES_USER` has to be expanded *inside* the container, where it exists, not by your own shell, where it does not.)

Put that on a schedule with `cron`, and copy the result somewhere that is not this machine — a NAS, an external drive, another computer.

> ⚠️ **An untested backup is a belief, not a backup.** Restore one onto a spare machine and confirm you can log in, *before* you need it. This project does not yet ship a tested restore script; writing one is on the list. (Until then, thoughts and prayers.)

---

## Updating

```bash
cd FreeFamilyDisplay
git pull
docker compose -f infra/compose.yaml --env-file .env up -d --build
```

Migrations run automatically on start, as they did the first time. Take a [backup](#backups) first — it takes ten seconds and someday you will be glad.

Your `.env` is not touched by `git pull`. After a big update, skim `.env.example` for variables that are new.

---

## Troubleshooting

These are real problems this project hit during its own deployment. You will probably hit some of them too.

### The wall display shows tomorrow's date after dinner

`TZ` is wrong or unset in `.env`. Boards are drawn on the server, so the server's idea of "today" is the one that counts, and with no timezone set that is UTC — which rolls over to the next day in the evening for anyone west of London.

Set `TZ` to your IANA zone (`America/New_York`, `Europe/Madrid`) and restart. The container images already include the timezone database; earlier versions did not, which is exactly how this bug was found.

### The browser says "internal error" or "no peer certificate" and won't load at all

Not the usual "not private" warning — a hard handshake failure. This happens when `SITE_HOST` is empty or does not match the address you are typing.

Browsers send no hostname during the handshake when you type a bare IP address, so the server has to be told which certificate to serve by default. `SITE_HOST` is what tells it. It is a required variable; the stack refuses to start without it, but it cannot tell whether the value is *right*.

Check that `SITE_HOST` is exactly the IP or name you type in the browser, and that `APP_URL` is the same thing with `https://` and `:8443` around it.

### The `caddy` container restarts forever with "exec /usr/bin/caddy: operation not permitted"

Every container here runs with all Linux capabilities dropped, and Caddy's binary needs exactly one of them back to bind its port. The shipped `infra/compose.yaml` already grants it (`cap_add: NET_BIND_SERVICE`). If you see this, something in your copy of the compose file removed it — put it back rather than dropping the other hardening.

### Everything is up, but the web page is broken or empty

Check `docker compose -f infra/compose.yaml --env-file .env logs web` and look for a database error. Compose refuses to start when a variable is *missing*, but it cannot catch a *typo* — a wrong password inside `DATABASE_URL` looks perfectly valid until Postgres rejects it.

### "permission denied … /var/run/docker.sock"

Your user is not in the `docker` group:

```bash
sudo usermod -aG docker $USER
```

Then **log out and log back in.** Group membership is only read at login. Do not reach for `sudo docker` instead; fix the group.

### Containers stuck at "health: starting"

Normal for the first minute or two on a first build. Judge after two minutes. `migrate` showing `exited (0)` is success, not a failure.

### "bind: address already in use" on 8443

Something else on the machine owns that port. Find it with `sudo ss -ltnp 'sport = :8443'`, then either stop it or change the published port in `infra/compose.yaml` — and update `APP_URL` to match.

### It works on the server but not from my phone

Check you are using the machine's LAN IP and not `localhost`. If you have a firewall enabled, note that Docker's published ports usually bypass `ufw` — so 8443 tends to work anyway, but make sure you have not locked yourself out of SSH.

### I forgot my password

There is no reset email, because there is no email. No magical link will arrive to save you. Reset it on the server using the terminal like it's 1998:

```bash
docker compose -f infra/compose.yaml --env-file .env exec   -e OP_EMAIL=you@example.com -e OP_NAME="Your Name" -e OP_PASSWORD='a new long password'   worker node apps/worker/dist/create-operator.js
```

This also signs out every device that was logged into that account, which is what you want if you are resetting because something felt wrong.

### The wall screen shows a certificate warning instead of the board

The certificate is not installed on that device — see [HTTPS on your home network](#https-on-your-home-network). On a Linux kiosk, the usual cause is that it was installed into the system store but not into Chromium's own store, or was installed as a different user than the one the kiosk runs as.

### A random Google account avatar is stretched across my display

Fixed — update. The Google album reader used to scrape the account's letter avatar off the album page along with the photos.

---

## What this is not

- **There is no hosted version.** Nobody runs this for you. If you did not install it, you do not have it.
- **There is no support desk, no ticket system, and no company.** This is software someone wrote for their own house and published so you could have it too. GitHub issues are read when there is time, by one person, in spare hours, usually while drinking coffee and sighing heavily.
- **There is no telemetry, no analytics, and no crash reporting.** Not "anonymised" — none. The software has no code that contacts the people who wrote it, and it never will. We genuinely do not care how you use this. This is a permanent commitment, not a current state.
- **Your data does not go anywhere.** Accounts, boards, calendar links, and photos live in Postgres and on disk on your own machine. Calendar and photo *links* are encrypted at rest. The only outbound requests this software ever makes are to the calendar feeds, photo folders, and weather service that someone in your house pasted in. Nothing else leaves the box.
- **There is no account system beyond your machine.** No central login, no password reset service, and no "sign in with Google" button to sell your soul.
- **This is not a product** and does not want to become one. There is no growth goal. Ten active accounts isn't a metric to be improved upon—it just means ten people chose the hard way.

---

## Honest limitations

Things that do not work yet, stated plainly so you can decide before spending an evening:

- **You cannot add a second person from inside the app yet.** The first-run wizard creates one account, and there is currently no "add someone" screen. Everyone in the house shares that login for now, or you add accounts by hand on the server with the command in [Troubleshooting](#troubleshooting). An in-app invite flow is the next piece of work.
- **No tested restore script.** Backup instructions are above; a proven, scripted restore is not written yet.
- **Certificate trust is documented for Linux only** — see the note in [HTTPS on your home network](#https-on-your-home-network).
- **Wall screen links are per board, not per screen.** Three screens showing the same board share one link, so revoking it affects all three.
- **Google Photos album support is best-effort.** It reads public album pages, which Google can change without warning. A public Drive folder (with `GOOGLE_API_KEY` set) is the sturdier route.
- **Only reachable on your own network by default.** Getting to it from outside the house means setting up a Cloudflare Tunnel yourself; the plumbing is in the compose file but it is off and unsupported.

---

## For developers

```bash
npm install
npm run check        # typecheck + lint + unit tests
npm run dev          # Next dev server on :3010 (needs a database)
```

`CLAUDE.md` carries the working rules; `docs/project-plan.md` is the specification and `docs/adr/` records the decisions that changed it — including [ADR 0004](docs/adr/0004-freeware-self-hosted-per-family.md), which is why this file exists.

---

## License

**Apache License 2.0.** See [`LICENSE`](LICENSE) for the full text and [`NOTICE`](NOTICE) for the copyright, warranty disclaimer, and trademark terms.

Free Family Display &copy; 2026 **Layer One IT Consultants**
(<https://layeroneconsultants.com/>). Developed by Layer One IT Consultants and given away free of charge.

You may run it, modify it, and redistribute it, including commercially. If you redistribute it you must keep the copyright notice and the `NOTICE` file, and state what you changed. The licence includes an explicit patent grant.

### No warranty, and nobody is operating this for you

> This software is provided **"AS IS"** and **"AS AVAILABLE"**, without warranty of any kind, express or implied, including any warranty of merchantability, fitness for a particular purpose, accuracy, or non-infringement. To the fullest extent permitted by law, Layer One IT Consultants is not liable for any loss, damage, or expense arising from use of, or inability to use, this software.

Layer One IT Consultants **does not host this and does not operate it.** There is no hosted version, no subscription, no support desk, and no account anywhere but your own box. Nobody at Layer One can see your instance or anything in it. Patching it, backing it up, and securing it are yours to do.

Don't rely on it where a mistake or an outage would cause harm &mdash; medical timing, travel, safety, or money.

### The Layer One name and logo are not covered

"Layer One", "Layer One IT Consultants", and the Layer One mark in `apps/web/public/brand/` belong to Layer One IT Consultants. Section 6 of the Apache License grants no trademark rights. The licence covers the code, not the brand: fork it freely, but don't present your fork as Layer One's, and swap the mark out if you rename it.

### The photographs are separately licensed

This repository ships **143 photographs that are not Apache-licensed.** Each one stays under its own terms &mdash; CC0, public domain, CC BY, or CC BY-SA &mdash; and each is credited on screen where it appears.

The full per-image list is in **[`ATTRIBUTION.md`](ATTRIBUTION.md)**, generated from the same manifests the app reads:

```bash
npm run attribution
```

Share-alike (CC BY-SA) attaches to those images and to adaptations of them. It does not reach the source code.

Anything your household adds to its own instance &mdash; your photos, a linked album, or art fetched by tag &mdash; is never committed here and is never redistributed by this project.
