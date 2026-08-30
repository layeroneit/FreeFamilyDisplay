# Handoff — Claude Code on the Raspberry Pi (portrait wall display)

**Status:** Active · **Applies to:** Raspberry Pi 4, Raspberry Pi OS Bookworm (64-bit), Claude Code installed on the Pi
**Companion doc:** [`runbook-pi-kiosk.md`](runbook-pi-kiosk.md) — the full kiosk runbook. This document does not repeat it; it adds the one thing the runbook does not cover in depth: **the Pi drives a vertical (portrait) display**, and hands the whole job to a Claude Code session running on the Pi itself.

How to use this file: SSH into the Pi (or sit at it), start `claude`, and paste **section A** below — ideally paste this *entire document*, since section A tells Claude to follow sections B–D. Keep `runbook-pi-kiosk.md` handy (paste it too, or fetch it onto the Pi); several steps defer to it.

Server-side facts, so nothing below is a surprise:

- The app runs in an LXC on Proxmox at `192.168.1.50`. Caddy terminates HTTPS on port **8443** with its **internal CA** (self-signed). Current URL: `https://192.168.1.50:8443`. After the rename in runbook §1 it becomes `https://freedisplay.local:8443` — this doc writes `<host>` for whichever applies.
- Everything is **LAN-only**. Nothing is exposed to the internet, and nothing here changes that.
- The wall URL is `https://<host>:8443/boards/<boardId>/view`. It is **session-gated** — there is no device pairing or 6-digit code yet (later phase). The Pi's browser signs in once with the operator password and holds a 90-day rolling session cookie in a dedicated Chromium profile.
- The board view shows a "▶ Start on this screen" overlay that requests fullscreen, hides the cursor after ~4 s of stillness, detects the screen's shape from `window.screen`, and — when the screen looks portrait but the board is set landscape — offers a one-tap **"Switch to portrait"** that PATCHes the board's canvas.

---

## A) What to tell Claude on the Pi

Paste this block (with the two placeholders filled in) into Claude Code on the Pi:

```text
You are Claude Code running on a Raspberry Pi 4 (Raspberry Pi OS Bookworm, 64-bit)
with shell access. Goal: turn this Pi into an unattended wall display for our
family board app, on a display that is PHYSICALLY MOUNTED IN PORTRAIT.

The app is on the LAN at https://<host>:8443 (currently <host> = 192.168.1.50;
it may become freedisplay.local). The wall page is
https://<host>:8443/boards/<boardId>/view. HTTPS uses Caddy's internal CA
(self-signed), so the CA root must be trusted properly — see constraints.

Work through the numbered steps in the handoff document below this prompt
(sections B, C, D), in order:
  1. Rotate the OS display to portrait (detect Wayland/labwc vs X11 first) and
     persist it, so the desktop reports 1080x1920.
  2. Make the hostname resolve, trust the Caddy root CA in BOTH the system
     store and Chromium's NSS db, then a one-time manual sign-in.
  3. Kiosk launch script + systemd --user unit with Restart=always and linger.
  4. Run the verification checklist, including a reboot test.

Constraints — do not violate these:
  - LAN only. Do not expose anything to the internet or touch port forwarding.
  - Never use --ignore-certificate-errors (or any global TLS-verification
    bypass) as a fix. Install the CA root instead.
  - Never write, echo, or store the operator password anywhere — no files, no
    scripts, no shell history. When sign-in is needed, open the browser and
    ask ME to type the password myself.
  - Do not modify anything on the server at 192.168.1.50 (no ssh edits under
    /opt/FreeFamilyDisplay, no docker commands there). This Pi only.
Ask me for: the board id, my sudo password when needed, and to type the app
password at the login page. Confirm each destructive step before running it.
```

Fill in `<host>` and `<boardId>` before pasting. Everything else is literal.

---

## B) The steps that prompt expects Claude to carry out

### B1. Detect the session type (Wayland vs X11)

Pi OS Bookworm on a Pi 4 defaults to a **Wayland** session (labwc on current images; earlier Bookworm images used wayfire). Older installs and deliberate opt-outs run X11. Everything about rotation depends on which one is live, so check first, from a terminal *inside the desktop session* (or see the SSH note below):

```bash
echo $XDG_SESSION_TYPE        # "wayland" or "x11"
loginctl show-session $(loginctl | awk '/seat0/ {print $1; exit}') -p Type
```

Over SSH those environment variables are absent. For the Wayland tools below to work over SSH, prefix them so they find the compositor's socket:

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export WAYLAND_DISPLAY=wayland-0    # confirm: ls $XDG_RUNTIME_DIR/wayland-*
```

### B2. Rotate the display to portrait

The physical panel is mounted vertically. Which way it was turned (clockwise vs counter-clockwise) depends on the mount — try one transform, look at the screen, use the other if the picture is upside-down. The output name (`HDMI-A-1`, `HDMI-A-2`, `HDMI-1`, …) depends on which micro-HDMI port the cable is in — always read it from the tool's own listing, never assume.

**Wayland (labwc or wayfire) — the expected path on Bookworm:**

```bash
sudo apt install -y wlr-randr    # if not present
wlr-randr                        # lists outputs; note the name, e.g. HDMI-A-1
wlr-randr --output HDMI-A-1 --transform 90    # or 270 if upside-down
```

This takes effect immediately but does not survive a reboot. Persist it:

- **labwc** (current default): the command goes in `~/.config/labwc/autostart`. Caveat: on Pi OS the session normally runs the *system* autostart at `/etc/xdg/labwc/autostart` (which launches the desktop background, panel, etc.); if creating a user copy, start from the system file so those aren't lost:

  ```bash
  mkdir -p ~/.config/labwc
  [ -f /etc/xdg/labwc/autostart ] && cp -n /etc/xdg/labwc/autostart ~/.config/labwc/autostart
  echo 'wlr-randr --output HDMI-A-1 --transform 90 &' >> ~/.config/labwc/autostart
  ```

- **wayfire** (older Bookworm images): persist in `~/.config/wayfire.ini` instead, using the same output name:

  ```ini
  [output:HDMI-A-1]
  transform = 90
  ```

- GUI alternative on either: the desktop's **Screen Configuration** tool (Preferences menu) has an orientation setting and writes the persistence for you. Fine to use if a human is at the desktop; the commands above are the headless equivalent.

**X11 (older setups only):**

```bash
xrandr                                   # note the output name, e.g. HDMI-1
xrandr --output HDMI-1 --rotate right    # or "left" if upside-down
```

Persist by prepending it to the LXDE autostart (before the kiosk line, if that file is also used for autostart — see runbook §5):

```bash
echo '@xrandr --output HDMI-1 --rotate right' | sudo tee -a /etc/xdg/lxsession/LXDE-pi/autostart
```

**Kernel-cmdline alternative (KMS level):** adding `video=HDMI-A-1:1920x1080M@60,rotate=90` to the single line in `/boot/firmware/cmdline.txt` rotates the framebuffer **including the boot console** — useful if the scrolling boot text bothering you sideways matters on a wall display. Caveats, honestly: the old `display_rotate=` in `config.txt` is ignored under the KMS driver Bookworm uses; and the cmdline rotation is applied *below* the compositor, which sets its own transform once the desktop starts — so you generally still configure the compositor as above, and mixing the two is where double-rotation confusion comes from. Recommendation: compositor-level rotation only (wlr-randr/xrandr), and accept a sideways boot console.

**If the display is a touchscreen** (brief, and hardware-dependent): rotating the video does not automatically rotate touch input everywhere. On Wayland/labwc, touch usually follows the output transform once the touch device is mapped to that output; if touches land in the wrong place, the fix is mapping/calibration in the compositor config. On X11 it never follows — you set a coordinate transformation matrix, e.g. for a 90° rotation:

```bash
xinput set-prop "<touch device name>" "Coordinate Transformation Matrix" 0 1 0 -1 0 1 0 0 1
```

For a plain HDMI TV or monitor, skip this entirely.

### B3. Verify the rotation

The reported resolution must be **1080x1920** (height > width). Rotated-but-still-1920x1080 means the transform didn't apply.

```bash
wlr-randr     # Wayland: the current mode shows 1920x1080 with "Transform: 90" — effective desktop is 1080x1920
xrandr        # X11: the output line itself reads 1080x1920 after --rotate
```

The app-side confirmation comes later: the board view's overlay prints the screen size it sees (e.g. "This screen is 1080×1920") — that is `window.screen` agreeing with the OS.

### B4. OS rotation vs. the app's PORTRAIT canvas — both must agree

These are two different settings and **both** are required:

1. **OS rotation (B2)** makes the desktop — and therefore Chromium and `window.screen` — 1080×1920. Without it, the browser thinks it is on a landscape screen no matter how the panel is mounted.
2. **The board's canvas preset** tells the *app* which fixed canvas the board is authored on. Presets are fixed pixel canvases — `PORTRAIT` is exactly **1080×1920** (`LANDSCAPE` 1920×1080, `ULTRAWIDE` 2560×1080) — and the kiosk scales the whole board with a single transform; there is no responsive reflow.

If only the OS is rotated but the board stays `LANDSCAPE`, you get a landscape layout scaled down inside a portrait screen (letterboxed). If only the canvas is `PORTRAIT` on an unrotated screen, the opposite. Rotate the OS **first**, then fix the canvas.

**The easy path for step 2:** once the rotated screen shows the board view, the overlay detects the mismatch itself ("This screen is 1080×1920 — looks portrait, but this display is set to landscape") and offers a one-tap **"Switch to portrait"** which saves the board's canvas via a PATCH. One click, done. Alternative: set the canvas from the board editor on any laptop. Either way this is a one-time, per-board change stored server-side.

### B5. Hostname resolution — see runbook §1

Do not re-derive this; runbook §1 has the full decision. Summary: the recommended setup is **mDNS from the LXC** (avahi advertising `freedisplay.local` — an operator/server-side step, out of scope for this Pi per the constraints) layered with an **`/etc/hosts` line on the Pi as instant fallback**, which *is* a Pi-side step you can do:

```bash
echo "192.168.1.50 freedisplay.local" | sudo tee -a /etc/hosts
```

If the server has not been renamed yet (runbook §1.4), the certificate still says `192.168.1.50` — use the IP in the URLs below until the operator does that step, then swap the name into the unit file.

### B6. Trust the Caddy root CA — see runbook §2

Runbook §2 is the authority (including how the CA file is exported from the LXC — ask the human to run that side, or fetch `/tmp/ffd-root.crt` if they already staged it). The Pi-side installs, both mandatory:

System store (fixes `curl`, and anything using OpenSSL):

```bash
sudo cp ~/ffd-root.crt /usr/local/share/ca-certificates/ffd-root.crt
sudo update-ca-certificates
```

Chromium's NSS db (Chromium on Linux does **not** read the system store — this one kills the interstitial). Run as the same user the kiosk runs as:

```bash
sudo apt install -y libnss3-tools
mkdir -p "$HOME/.pki/nssdb"
[ -f "$HOME/.pki/nssdb/cert9.db" ] || certutil -d sql:$HOME/.pki/nssdb -N --empty-password
certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "FFD Local CA" -i ~/ffd-root.crt
certutil -d sql:$HOME/.pki/nssdb -L    # "FFD Local CA" listed with trust C,,
```

### B7. First-run manual sign-in — see runbook §4.2

The view page is session-gated; unauthenticated it redirects to `/login`. Open Chromium **windowed, on the Pi's own desktop, with the exact `--user-data-dir` the kiosk will use** — then step back and **ask the human to type the operator password**. Never type, echo, or store it yourself.

```bash
chromium-browser --user-data-dir=$HOME/.config/ffd-kiosk "https://<host>:8443/login"
```

(Newer images name the binary `chromium` — check which exists and use it consistently in B8 too.) After sign-in: accept the terms page if it appears, open the board view, confirm it renders — this is also the moment the portrait-mismatch overlay appears, so click **"Switch to portrait"** now (B4). Close the window. The 90-day rolling cookie now lives in `~/.config/ffd-kiosk`; because the page refreshes every 5 minutes and the window slides on use, a powered display effectively never logs out.

### B8. Kiosk launch and autostart — see runbook §4.3 and §5

Use the runbook's launch line and systemd `--user` unit verbatim (they are the source of truth for the flag set and the flag-by-flag reasoning). The short form — create `~/.config/systemd/user/ffd-kiosk.service`:

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
  "https://<host>:8443/boards/<boardId>/view"
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

Then enable it and let it run without an interactive login:

```bash
systemctl --user daemon-reload
systemctl --user enable --now ffd-kiosk.service
sudo loginctl enable-linger $USER
```

`Restart=always` both restarts on crash and papers over the boot race with the compositor (runbook §5 explains). One portrait-specific note: under `--kiosk` the page is already fullscreen, so the "Start" button needs no click — but if B7's canvas switch was skipped, the mismatch overlay will be waiting; one click on "Switch to portrait" (mouse or touch) settles it permanently. Use the systemd unit **or** a desktop-autostart line (runbook §5), never both — two Chromiums.

Also do runbook §3's kiosk hygiene if not already done: desktop autologin (`sudo raspi-config nonint do_boot_behaviour B4`) and screen blanking off (`sudo raspi-config nonint do_blanking 1`).

---

## C) Verification checklist (run all of these at the end)

1. **Portrait resolution.** `wlr-randr` (Wayland) shows the output with `Transform: 90` (or 270) — effective 1080×1920; on X11, `xrandr` reports `1080x1920`. And the desktop visibly stands upright on the panel.

2. **CA trusted — no `-k`.** This must return an HTTP response (200, or a redirect for `/login`) with **no** `-k`/`--insecure` flag and no TLS error:

   ```bash
   curl -I https://<host>:8443/login
   curl -i https://<host>:8443/healthz
   ```

   And `certutil -d sql:$HOME/.pki/nssdb -L` lists `FFD Local CA` with trust `C,,`.

3. **Unit enabled and active.**

   ```bash
   systemctl --user is-enabled ffd-kiosk.service   # enabled
   systemctl --user is-active ffd-kiosk.service    # active
   loginctl show-user $USER -p Linger              # Linger=yes
   ```

4. **Reboot test.** `sudo reboot`, then wait and confirm: the Pi comes back to the board, fullscreen, portrait, signed in (no login page, no cert interstitial), with no keyboard attached. Over SSH afterwards: `systemctl --user status ffd-kiosk.service` is `active (running)` and `journalctl --user -u ffd-kiosk.service -e` shows no crash loop.

5. **Layout sanity.** The board fills the vertical screen edge-to-edge — no letterboxing (letterboxing means the canvas is still `LANDSCAPE`; see B4) — and the cursor disappears after ~4 s of stillness.

If anything fails, the troubleshooting table in [`runbook-pi-kiosk.md`](runbook-pi-kiosk.md) §7 covers the common cases (blank screen, cert warning, login page, wrong shape, overscan, restart loop).

---

## D) What Claude on the Pi must NOT do

- **No `--ignore-certificate-errors` as a fix.** It disables certificate checking for every site the browser touches and turns a spoofed LAN name into a silently-accepted impostor login page. Runbook §2 explains; the only acceptable use is a one-off diagnostic to prove a cert problem is a cert problem, removed immediately after. The same goes for `curl -k` in anything persistent, and for any global TLS-verification override.
- **Never write the operator password anywhere.** Not in a file, not in a script, not in a systemd unit, not in an `echo`/`curl` command (which would also land it in shell history), not in this repo. Sign-in happens in the browser, typed by the human (B7). If the human offers to tell you the password, decline and point them at the login page.
- **No internet exposure.** Do not set up port forwarding, tunnels, reverse proxies, or firewall changes that expose the app or the Pi beyond the LAN. The deployment is LAN-only by design.
- **Do not edit anything under `/opt/FreeFamilyDisplay` on the LXC** (192.168.1.50). That is the other machine's repo checkout, managed from the dev box. Steps that require server-side changes (avahi/`SITE_HOST` rename, exporting the CA file) belong to the operator via the runbook — ask, don't do.
- **No `docker` commands against the LXC.** Not over SSH, not via a remote Docker context. The compose stack there is not this session's to restart, rebuild, or inspect.
- **Do not delete `~/.config/ffd-kiosk` or add `--incognito`** — either one logs the kiosk out (runbook §4.2/§7).
