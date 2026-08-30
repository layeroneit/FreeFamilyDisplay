# Runbook — Raspberry Pi 4 as a wall kiosk

**Status:** Active · **Applies to:** Raspberry Pi 4 (2 GB+), Raspberry Pi OS (Bookworm or later, 64-bit)
**Server side:** the FreeFamilyDisplay LXC on Proxmox at `192.168.1.50`, Caddy on `:8443` (HTTPS, internal CA) — see `docs/runbook-vm.md` for how that host was stood up.

This is a follow-along for putting a Pi 4 on the wall showing one board,
full-screen, surviving reboots, with no keyboard attached. Steps are numbered
so a follow-up question can point at one.

Three machines appear below. Every fenced block is labeled with where it runs:

- **[Windows]** — your workstation (PowerShell)
- **[LXC]** — the app host, over `ssh <user>@192.168.1.50`
- **[Pi]** — the Raspberry Pi, over `ssh <pi-user>@<pi-ip>` or its own terminal

Two honest limitations up front, so nothing below surprises you:

1. ~~**There is no device pairing today.**~~ **Outdated — use a display link.**
   A board can now mint its own bearer URL: open the board in the editor, use
   the **Wall screen link** panel, and point the Pi at the
   `https://<host>:8443/d/<token>` URL it hands you (shown once). That page
   needs no session at all, carries no admin UI, and refreshes itself every
   5 minutes.

   **Wherever a step below says to sign the Pi into the admin session and open
   `/boards/<id>/view`, use the `/d/<token>` URL instead.** Doing so skips §4.2
   entirely and removes the whole "the kiosk is showing the login page" class
   of failure in §7.

   Still true: the token belongs to the **board, not the screen**. Several
   screens showing one board share one link, and replacing it stops all of
   them. A 6-digit pairing code and per-device revocation are still a later
   phase.

   Original text, for reference: the Pi's browser signs in once with the
   operator password and keeps a **90-day rolling session cookie**; because the
   board page refreshes itself every 5 minutes and the session window slides
   forward on use, a display that stays powered effectively never logs out.
2. **Everything is LAN-only.** No internet exposure, no Cloudflare tunnel yet.
   The Pi must be on the same LAN (and subnet/VLAN) as the LXC.

---

## 1. Give the app a real hostname (instead of the IP)

Today the URL is `https://192.168.1.50:8443`. You asked to move the Pi to a
proper name. There is no public DNS involved (LAN-only), so the name has to be
resolvable *inside your LAN*. Three options, worst-hidden-cost first:

### Option A — Router DNS entry (`display.home` → 192.168.1.50)

If your router's admin UI has a "local DNS" / "DNS host mapping" / "static
hostname" feature, add an entry mapping a name like `display.home` to
`192.168.1.50`. Every device on the LAN then resolves it, with zero software
installed anywhere.

**Honest caveat:** many consumer routers simply cannot do this — ISP-supplied
boxes especially. Some only map names for DHCP clients (and the LXC's IP is on
the Proxmox host's bridge, which confuses that). If your router UI has no such
field, don't fight it; use Option B. This step depends entirely on your
specific router — no command here can be copy-pasteable.

If you use this option: `SITE_HOST=display.home` and
`APP_URL=https://display.home:8443` in the LXC's `.env` (see §1.4 below).

### Option B — mDNS from the LXC (`freedisplay.local`) — **recommended**

Install avahi-daemon in the LXC. It multicasts the name itself; nothing on the
router changes, and every mDNS-capable device on the LAN (which includes
Raspberry Pi OS out of the box — Chromium resolves `.local` through the
system resolver, which Pi OS wires to Avahi) picks it up.

```
# [LXC]
sudo apt update && sudo apt install -y avahi-daemon
```

By default Avahi advertises `<hostname>.local`. To advertise the shorter
`freedisplay.local` regardless of the machine's hostname, set it explicitly:

```
# [LXC]
sudo sed -i 's/^#\?host-name=.*/host-name=freedisplay/' /etc/avahi/avahi-daemon.conf
sudo systemctl restart avahi-daemon
```

Verify from the Pi (or any Linux/mac box on the LAN):

```
# [Pi]
ping -c 2 freedisplay.local
```

**Honest caveats:** mDNS is link-local multicast — it does not cross subnets
or VLANs, and a few networks (some mesh Wi-Fi systems, "AP/client isolation"
settings) filter multicast between wireless and wired segments. If the ping
above fails from the Pi but `ping 192.168.1.50` works, that is your network
eating multicast — fall back to Option C (same name, so nothing else changes).
Also: the LXC needs multicast on its bridge; standard Proxmox `vmbr0`
networking passes it fine.

If you use this option: `SITE_HOST=freedisplay.local` and
`APP_URL=https://freedisplay.local:8443`.

### Option C — `/etc/hosts` on the Pi only — instant fallback

One line on the Pi. Works immediately, needs nothing from the router or the
LXC — but **only the Pi** sees the name; your phone and laptop keep using the
IP (or need their own hosts entries).

```
# [Pi]
echo "192.168.1.50 freedisplay.local" | sudo tee -a /etc/hosts
```

Deliberately the *same name* as Option B: `hosts` is consulted before mDNS on
Pi OS, so you can layer this under Option B as insurance and the certificate,
`SITE_HOST`, and kiosk URL never change. `SITE_HOST=freedisplay.local`,
`APP_URL=https://freedisplay.local:8443`.

**Recommendation: do Option B, and add Option C on the Pi as the instant
fallback.** The wall display keeps working even on a multicast-hostile
network, and every other device still gets the nice name when mDNS works.

### 1.4 Point the stack at the new name

Whatever name you chose, the server must know it — the Caddyfile serves
`{$SITE_HOST}:8443` and mints its TLS certificate for exactly that name, and
the app builds absolute links from `APP_URL`.

```
# [LXC]
sudo nano /opt/FreeFamilyDisplay/.env
```

Change **both** lines (they must agree):

```
SITE_HOST=freedisplay.local
APP_URL=https://freedisplay.local:8443
```

Then restart the stack so Caddy and web pick up the change:

```
# [LXC]
cd /opt/FreeFamilyDisplay/infra
docker compose --env-file ../.env up -d
```

**Warning — one-time browser warning:** changing `SITE_HOST` makes Caddy mint
a fresh leaf certificate for the new name. Any browser that had merely
clicked through the interstitial for the old IP cert will warn again once.
Devices that install the root CA (§2) won't warn at all — which is exactly
why §2 comes *after* the rename, not before. The root CA itself lives on the
persistent `caddydata` volume and does **not** change, so §2 only ever needs
doing once per device.

The old `https://192.168.1.50:8443` URL will now show a certificate-name
mismatch (the cert says `freedisplay.local`). That is expected — use the name.

## 2. Trust the self-signed certificate on the Pi

Caddy signs with its own internal CA. Without this section, Chromium shows a
"Your connection is not private" interstitial on every cold start — fatal for
an unattended kiosk. The fix is to install Caddy's **root CA** into the Pi's
trust stores. Two stores matter: the system one (curl, apt-transports, etc.)
and Chromium's own NSS database (Chromium on Linux does not read the system
store).

1. Export the root CA out of the caddy container. It lives on the caddy data
   volume at `/data/caddy/pki/authorities/local/root.crt`:

   ```
   # [LXC]
   cd /opt/FreeFamilyDisplay/infra
   docker compose --env-file ../.env cp caddy:/data/caddy/pki/authorities/local/root.crt /tmp/ffd-root.crt
   ```

   (Plain `docker cp ffd-caddy-1:/data/caddy/pki/authorities/local/root.crt /tmp/ffd-root.crt`
   works too if you prefer — `docker compose ps` shows the exact container name.)

2. Copy it to the Pi:

   ```
   # [Pi]
   scp <user>@192.168.1.50:/tmp/ffd-root.crt ~/ffd-root.crt
   ```

3. Install into the **system** trust store:

   ```
   # [Pi]
   sudo cp ~/ffd-root.crt /usr/local/share/ca-certificates/ffd-root.crt
   sudo update-ca-certificates
   ```

   Verify — this must succeed with no `-k` flag:

   ```
   # [Pi]
   curl -i https://freedisplay.local:8443/healthz
   ```

4. Install into **Chromium's NSS database** (this is the one that actually
   kills the interstitial):

   ```
   # [Pi]
   sudo apt install -y libnss3-tools
   mkdir -p "$HOME/.pki/nssdb"
   [ -f "$HOME/.pki/nssdb/cert9.db" ] || certutil -d sql:$HOME/.pki/nssdb -N --empty-password
   certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "FFD Local CA" -i ~/ffd-root.crt
   ```

   Verify it took:

   ```
   # [Pi]
   certutil -d sql:$HOME/.pki/nssdb -L
   ```

   `FFD Local CA` should be listed with trust `C,,`.

**Last resort — don't:** Chromium accepts `--ignore-certificate-errors`,
which suppresses the interstitial without any CA install. It is strictly
worse: it disables certificate checking for *every* site the browser touches,
shows a permanent "unsupported flag" warning bar in some builds, and turns a
misdirected DNS answer (or anyone on your LAN spoofing the name) into a
silently-accepted impostor login page — the page where you type the operator
password. Two `certutil` commands are cheaper than that. Use the flag only to
prove a cert problem is a cert problem, then remove it.

## 3. Pi OS setup

**Recommendation: Raspberry Pi OS Desktop (64-bit) with autologin**, not Lite
plus a hand-rolled session. Reasoning for a Pi 4: Desktop ships Chromium and a
maintained Wayland compositor (labwc) preconfigured, autologin and screen
blanking are raspi-config toggles instead of unit files, and the ~300 MB of
extra RAM it costs is not the bottleneck for one browser tab. Lite + `cage` is
leaner and perfectly valid, but every piece is yours to assemble and debug;
this runbook assumes Desktop.

1. Flash **Raspberry Pi OS with desktop (64-bit)** with Raspberry Pi Imager.
   In Imager's settings (gear icon), set the hostname, a username/password,
   Wi-Fi if not using Ethernet (prefer Ethernet for a wall display), and
   **enable SSH** — you will manage this Pi headlessly later.

2. First boot, then patch:

   ```
   # [Pi]
   sudo apt update && sudo apt full-upgrade -y
   ```

3. Enable desktop autologin:

   ```
   # [Pi]
   sudo raspi-config nonint do_boot_behaviour B4
   ```

   (`B4` = Desktop, logged in automatically. Or interactively:
   `sudo raspi-config` → System Options → Boot / Auto Login.)

4. Disable screen blanking:

   ```
   # [Pi]
   sudo raspi-config nonint do_blanking 1
   ```

   (`1` = blanking disabled. Interactively: Display Options → Screen
   Blanking → No.) This covers the compositor's idle timeout on the default
   Wayland session. If you are on the older X11 session instead, also add
   `@xset s off` / `@xset s noblank` / `@xset -dpms` to the LXDE autostart
   file named in §5.

5. Hide the mouse cursor. Two layers here, honestly stated:

   - The board view **already hides the cursor itself** after ~4 seconds of
     stillness (and shows its overlay again on pointer move) — with no mouse
     plugged into the wall Pi, you may need nothing at all.
   - For belt-and-braces on the X11 session, `unclutter` hides the pointer
     globally:

     ```
     # [Pi]
     sudo apt install -y unclutter
     ```

     Note: `unclutter` is an X11 tool and does nothing on the default Wayland
     (labwc) session — there, rely on the app's own hiding, or simply leave
     no pointing device attached.

6. One TV-specific check, depends on your TV: if the picture's edges are cut
   off, see the overscan row in §7 — fix it now while a keyboard is attached.

## 4. Chromium kiosk launch

1. Find the board's view URL. On your laptop, open the dashboard
   (`https://freedisplay.local:8443/dashboard`), open the board, and note its
   id from the address bar — the wall URL is:

   ```
   https://freedisplay.local:8443/boards/<boardId>/view
   ```

2. **First run — sign in by hand, once, windowed.** The view page is
   session-gated: unauthenticated it redirects to `/login`, and a login that
   hasn't accepted the current terms redirects to `/terms`. Do this on the Pi
   with a keyboard attached, using the *same* user-data-dir the kiosk will
   use, so the cookie lands where the kiosk reads it:

   ```
   # [Pi]  (in the Pi's desktop terminal, not over SSH)
   chromium-browser --user-data-dir=$HOME/.config/ffd-kiosk "https://freedisplay.local:8443/login"
   ```

   (On newer Pi OS images the binary is `chromium`; whichever exists, use it
   consistently here and in §5.) Sign in with the operator password, accept
   the terms page if it appears, open the board view, and confirm it renders.
   Then close the window. The 90-day session cookie now lives in
   `~/.config/ffd-kiosk` and survives reboots. Do not add `--incognito` or
   delete that directory — either one logs the kiosk out.

3. The kiosk launch line (§5 wraps this in a service):

   ```
   # [Pi]
   chromium-browser \
     --kiosk \
     --noerrdialogs \
     --disable-infobars \
     --disable-session-crashed-bubble \
     --check-for-update-interval=31536000 \
     --autoplay-policy=no-user-gesture-required \
     --user-data-dir=$HOME/.config/ffd-kiosk \
     "https://freedisplay.local:8443/boards/<boardId>/view"
   ```

   Flag-by-flag: `--kiosk` full-screen with no chrome; `--noerrdialogs` and
   `--disable-session-crashed-bubble` suppress the "Restore pages?" bubble
   after a power cut (a wall display *will* get power-cut); `--disable-infobars`
   hides notification bars; `--check-for-update-interval=31536000` stops
   update nagging for a year; `--autoplay-policy=no-user-gesture-required`
   lets media widgets play without a click; the dedicated `--user-data-dir` is
   what keeps the login session across reboots and separate from any other
   browsing profile.

   About the page's own "▶ Start on this screen" button: it exists for a
   normal browser window, where going fullscreen needs a user gesture. Under
   `--kiosk` you are already fullscreen — the button's fullscreen request
   fails harmlessly and the overlay treats the page as started. You do not
   need to click anything on boot. If the overlay reports a shape mismatch
   ("looks portrait, but this display is set to landscape"), that *is* worth
   one click — see §7.

## 5. Autostart on boot

### Preferred: systemd user service

Survives crashes (restarts Chromium automatically), controllable over SSH,
and logs to the journal.

1. Create the unit:

   ```
   # [Pi]
   mkdir -p ~/.config/systemd/user
   nano ~/.config/systemd/user/ffd-kiosk.service
   ```

   Contents (fix the binary name and `<boardId>`; `%h` is your home dir):

   ```ini
   [Unit]
   Description=FreeFamilyDisplay kiosk (Chromium)
   After=graphical-session.target

   [Service]
   ExecStart=/usr/bin/chromium-browser \
     --kiosk \
     --noerrdialogs \
     --disable-infobars \
     --disable-session-crashed-bubble \
     --check-for-update-interval=31536000 \
     --autoplay-policy=no-user-gesture-required \
     --user-data-dir=%h/.config/ffd-kiosk \
     "https://freedisplay.local:8443/boards/<boardId>/view"
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=default.target
   ```

   `Restart=always` is doing double duty: it is the restart-on-crash
   directive, and at boot it also papers over the race where the service
   starts a beat before the desktop session is ready — Chromium exits,
   systemd retries 5 s later, and the second attempt lands.

2. Enable it, and let your user's services run without an interactive login:

   ```
   # [Pi]
   systemctl --user daemon-reload
   systemctl --user enable --now ffd-kiosk.service
   sudo loginctl enable-linger $USER
   ```

   Linger keeps the user's systemd manager alive at boot and lets
   `systemctl --user` work from an SSH session — which is how you will manage
   this from the couch.

3. Check on it any time:

   ```
   # [Pi]
   systemctl --user status ffd-kiosk.service
   journalctl --user -u ffd-kiosk.service -e
   ```

### Simpler alternative: desktop autostart file

No service, no restart-on-crash — the compositor just launches the command at
session start. Fine if you'd rather have one line than a unit file.

On the default Wayland (labwc) session:

```
# [Pi]
mkdir -p ~/.config/labwc
echo 'chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --check-for-update-interval=31536000 --autoplay-policy=no-user-gesture-required --user-data-dir=$HOME/.config/ffd-kiosk "https://freedisplay.local:8443/boards/<boardId>/view" &' >> ~/.config/labwc/autostart
```

On the older X11/LXDE session, append instead to
`/etc/xdg/lxsession/LXDE-pi/autostart` (system-wide) with a leading `@` —
the `@` is LXDE's own respawn-on-crash marker:

```
# [Pi]
echo '@chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --check-for-update-interval=31536000 --autoplay-policy=no-user-gesture-required --user-data-dir=/home/<pi-user>/.config/ffd-kiosk https://freedisplay.local:8443/boards/<boardId>/view' | sudo tee -a /etc/xdg/lxsession/LXDE-pi/autostart
```

Use one mechanism or the other — both at once launches two Chromiums.

4. Reboot and watch it come up on its own:

   ```
   # [Pi]
   sudo reboot
   ```

## 6. Recovery and maintenance

**Getting out of kiosk mode.** With a keyboard plugged in: `Ctrl+W` closes
the tab, `Alt+F4` the window. Under the systemd service that just triggers a
restart 5 s later — to actually stop it, SSH in:

```
# [Pi]
systemctl --user stop ffd-kiosk.service     # stop until next boot
systemctl --user disable ffd-kiosk.service  # stop across reboots
```

**Force a refresh.** Usually unnecessary: the board view already reloads
itself every 5 minutes, so content and most app updates arrive on their own.
To force it now, either press `F5` on an attached keyboard, or over SSH:

```
# [Pi]
systemctl --user restart ffd-kiosk.service
```

**Session expiry.** The session is a 90-day *rolling* window that slides
forward on use — a display that is on and refreshing every 5 minutes keeps
renewing itself indefinitely. Expiry in practice means the Pi (or the server)
was powered off for 90+ days: the kiosk then boots into the login page.
Recovery is manual today — plug in a keyboard and mouse, sign in with the
operator password (the redirect brings you back), and the clock restarts.
There is no way to re-authenticate purely over SSH yet; device tokens that
remove this chore are a planned later phase.

**Server-side changes.** If you ever change `SITE_HOST` again, revisit §1.4
and update the URL in the service unit (then `systemctl --user daemon-reload`
and restart). The root CA does not change, so §2 never needs repeating on
this Pi.

## 7. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Blank/black screen | Distinguish the layers: no signal at all → cable/TV input/power. Desktop wallpaper but no kiosk → `systemctl --user status ffd-kiosk.service` and read `journalctl --user -u ffd-kiosk.service -e` (wrong binary name `chromium` vs `chromium-browser` is the classic). Kiosk up but page black → check the LXC is up: `curl -i https://freedisplay.local:8443/healthz` from the Pi. Screen goes dark after minutes → blanking snuck back on; re-run §3 step 4. |
| Certificate warning on boot | The root CA isn't in Chromium's NSS db — §2 step 4 was skipped, was run as a different user than the kiosk runs as, or targeted a different `$HOME`. Verify with `certutil -d sql:$HOME/.pki/nssdb -L`. A warning right after changing `SITE_HOST` with the CA installed means Caddy hasn't restarted with the new name — §1.4. |
| Login page instead of the board ("not signed in") | The session cookie is missing: first-run sign-in (§4.2) used a different `--user-data-dir` than the service, the dir was deleted, `--incognito` crept into the flags — or the 90-day window genuinely lapsed after a long power-off. Plug in a keyboard, sign in once, done. |
| Wrong screen shape (letterboxed / squished) | The board's canvas preset doesn't match the physical screen. The on-screen overlay detects this and shows a **"Switch to portrait/landscape"** button — nudge the mouse (or plug one in), click it once, and the board is re-saved to match. Or set the shape from the board editor on your laptop. |
| Edges cut off on a TV (overscan) | First check the TV's own picture settings — a mode named "Just Scan", "Full pixel", "Screen Fit", or "1:1" fixes it at the source (name depends on your TV). If the TV has no such mode, add `disable_overscan=1` under `[all]` in `/boot/firmware/config.txt` on the Pi and reboot. |
| Name resolves on the Pi but not on your phone/laptop | You are on Option C (`/etc/hosts` — Pi-only by design), or mDNS is being filtered between network segments (see §1 Option B caveats). Other devices can keep using `https://192.168.1.50:8443` — they'll see a cert-name warning, which is cosmetic for browsing but is why the Pi itself uses the real name. |
| Kiosk restarts in a loop at boot | The service is racing the compositor and losing every round — check `journalctl --user -u ffd-kiosk.service -e` for a display/Wayland error. Confirm autologin to desktop is on (§3 step 3) and `loginctl enable-linger` was run. Raising `RestartSec` to `10` gives the session more room. |
