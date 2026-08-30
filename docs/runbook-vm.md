# Runbook — Creating the FreeFamilyDisplay VM on the operator's own host

**Status:** Active · **Applies to:** Proxmox VE host "the operator's own host" · **Guest:** Ubuntu Server 24.04 LTS
**Decision record:** `adr/0001-vm-over-lxc.md` (VM, not LXC — read it if the sizing looks arbitrary)

This is a follow-along for standing the VM up by hand, at the console. Every VM
operation happens in the **Proxmox web UI** — no storage commands on the host,
per CLAUDE.md. Steps are numbered so a follow-up question can point at one.

> **This runbook is Proxmox-specific and describes the operator's own box.**
> If you are a household standing up your own copy, start with `README.md`
> instead — it is machine-agnostic and does not assume Proxmox, a VM, or this
> repository being private. Read this one for the per-step detail behind it.

The §8 **STOP** marker was a one-time gate for the first deployment's code
audit. That audit is done and the stack has been running since 2026-08-29 —
§8 is kept as a record and no longer blocks anything.

---

## 1. Create the VM (Proxmox web UI)

1. In the web UI, select **the operator's own host → local (or your ISO storage) → ISO Images →
   Download from URL** and fetch the current `ubuntu-24.04.x-live-server-amd64.iso`
   from `https://releases.ubuntu.com/24.04/`. Verify the checksum shown matches
   the one on the release page.
2. Click **Create VM** (top right). Work through the tabs in order.
3. **General:** Node `the operator's own host`, next free VM ID, Name `freefamilydisplay`.
   Tick **Start at boot** — a wall-display backend that stays down after a power
   blip fails the "operator doesn't think about it" test.
4. **OS:** select the Ubuntu 24.04 ISO. Type **Linux**, version **6.x - 2.6 Kernel**.
5. **System:**
   - Machine: **q35** — the modern PCIe layout; the older i440fx exists only for
     legacy guests.
   - BIOS: **OVMF (UEFI)**, tick **Add EFI Disk**, store it on the same storage
     as the VM disk. Keep "Pre-Enroll keys" checked; Ubuntu is signed and boots
     fine under Secure Boot.
   - SCSI Controller: **VirtIO SCSI single**.
   - Tick **Qemu Agent** — this is what lets Proxmox see the VM's IP, shut it
     down cleanly, and take consistent snapshots. §3 installs the guest half.
6. **Disks:** `scsi0`, **40 GB**. If the backing storage is SSD or ZFS, enable
   **Discard** and **SSD emulation** so freed blocks are actually released to the
   pool. Leave IO thread on (default with VirtIO SCSI single).
7. **CPU:** 1 socket, **4 cores**, Type **host** — passes the real CPU flags
   through instead of a lowest-common-denominator model; there is no live
   migration to preserve compatibility for.
8. **Memory:** **8192 MiB**, and **untick Ballooning Device**. Postgres and its
   page cache want a fixed memory ceiling; ballooning lets the host silently
   reclaim RAM and turns into unexplained database slowness.
9. **Network:** Bridge `vmbr0` (or your LAN bridge), Model **VirtIO
   (paravirtualized)**. No VLAN tag unless your LAN uses one.
10. **Confirm:** review, tick **Start after created**, Finish.

## 2. Ubuntu installer choices

11. Open the VM's **Console**. Take the installer defaults except where noted.
12. **Network:** DHCP is fine for now — but write down the IP it gets; §3 pins it.
13. **Storage:** "Use an entire disk" with **LVM** (the default) is fine. On the
    summary screen, select the `ubuntu-lv` volume, choose **Edit**, and grow it
    to the full remaining size — the installer only allocates about half the
    disk by default and there is no reason to leave 20 GB stranded.
14. **Profile:** hostname `freefamilydisplay`, pick your username. This account
    gets sudo.
15. **SSH:** tick **Install OpenSSH server**. If offered, importing your SSH key
    from GitHub here saves a step in §4.
16. **Featured snaps:** select none. Docker comes from get.docker.com in §5;
    the snap build of Docker has different paths and is not what the compose
    stack is tested against.
17. Reboot when prompted. The installer ejects the ISO itself; if boot loops
    back into it, detach the ISO under **Hardware → CD/DVD Drive → Edit → Do
    not use any media**.

## 3. First boot basics

18. Give the VM a stable address. Prefer a **DHCP reservation on the router**
    for this VM's MAC (visible under **Hardware → Network Device**) over static
    netplan config — same result, zero files to maintain in the guest, and the
    displays will be pointed at `http://<vm-ip>:8443`, so that IP must never
    change.
19. Log in on the console or `ssh <user>@<vm-ip>` and patch:
    `sudo apt update && sudo apt upgrade -y`, then `sudo reboot` if a kernel
    was updated.
20. Install the guest half of the agent enabled in step 5:
    `sudo apt install -y qemu-guest-agent && sudo systemctl enable --now qemu-guest-agent`
    Verify: the VM's **Summary** page in Proxmox now shows its IPs.
21. Turn on automatic security patches — this box must not need monthly attention:
    `sudo apt install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades`
    and answer **Yes**.

## 4. SSH hardening (LAN-only appropriate)

22. From your workstation, generate a key if you don't have one:
    `ssh-keygen -t ed25519`. Copy it to the VM — from Windows PowerShell:
    `type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh <user>@<vm-ip> "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"`
    (Skip if you imported the key from GitHub in step 15.)
23. **Open a brand-new terminal and confirm key login works** before touching
    the SSH config. Do not proceed on the strength of an already-open session.
24. Only then disable password auth. Create
    `/etc/ssh/sshd_config.d/50-hardening.conf` containing:
    ```
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PermitRootLogin no
    ```
25. Validate and apply: `sudo sshd -t && sudo systemctl restart ssh`. Confirm a
    fresh SSH session still works. The Proxmox console remains your break-glass
    if a key is ever lost — that is why password login can be off entirely.

## 5. Docker

26. Install via the official convenience script:
    `curl -fsSL https://get.docker.com -o /tmp/get-docker.sh && sh /tmp/get-docker.sh`
    (downloading to a file first so you can `less /tmp/get-docker.sh` before
    running it, if you like). This installs Docker Engine + the compose plugin.
27. Let your user run Docker without sudo: `sudo usermod -aG docker $USER`,
    then **log out and back in** — group membership is read at login, and this
    is the single most common "why doesn't docker work" trip-up.
28. Verify: `docker run --rm hello-world` prints its greeting, and
    `docker compose version` reports v2.x.

## 6. Clone

The repository is **public** (ADR 0004), so there is no authentication step —
no `gh auth login`, no token on the box, no key files to manage.

29. *(Was: install the GitHub CLI.)* No longer needed. Step numbers are kept so
    older notes that point at a number still land in the right place.
30. *(Was: `gh auth login`.)* No longer needed — a public repo clones anonymously.
31. Clone and enter:
    ```
    git clone https://github.com/layeroneit/FreeFamilyDisplay.git
    cd FreeFamilyDisplay
    ```
32. Note: the default branch is **`master`**, not `main`. `git branch
    --show-current` should already say `master`; nothing to switch.

## 7. Create `.env`

33. `cp .env.example .env && chmod 600 .env` — the file will hold real secrets,
    so it is owner-read-only and it is already gitignored. Never commit it.
34. Fill it as follows (generate each secret fresh; never reuse one across
    variables):

    | Variable | Value |
    |---|---|
    | `APP_URL` | `http://<vm-ip>:8443` — Caddy's published port. Plain HTTP: type the `http://` scheme explicitly, since `:8443` alone makes some browsers guess HTTPS. |
    | `NODE_ENV` | `production` |
    | `DATABASE_URL` | `postgresql://ffd:<db-password>@postgres:5432/ffd` — the host **must** be `postgres`, the compose service name. `localhost` will not resolve inside the containers. |
    | `POSTGRES_USER` | `ffd` |
    | `POSTGRES_PASSWORD` | output of `openssl rand -hex 24` — hex, not base64, because `/` and `+` would need URL-encoding inside `DATABASE_URL`. Must match the password in `DATABASE_URL`. |
    | `POSTGRES_DB` | `ffd` |
    | `REDIS_URL` | `redis://redis:6379` — again the compose service name |
    | `MASTER_KEY` | output of `openssl rand -base64 32` |
    | `SESSION_SECRET` | output of `openssl rand -base64 32` — a different one |
    | `AWS_REGION`, `SES_*` | leave empty — **permanently**. There is no email in this software (ADR 0004); nothing reads these and nothing breaks. |
    | `PEXELS_API_KEY`, `GOOGLE_API_KEY` | leave empty — optional, later phases |
    | `CLOUDFLARE_TUNNEL_TOKEN` | leave empty — cloudflared only runs under `--profile tunnel`, so the default stack is deliberately LAN-only. No internet exposure until that is a decision, not an accident. |

## 8. ~~⛔ STOP HERE~~ — cleared 2026-08-30

35. ~~**Do not run `docker compose up` yet.** A code audit is in progress; wait
    for the green light before first start.~~ **Cleared.** The audit that gate
    was waiting on is finished and the stack has been running since
    2026-08-29. Kept as a record of why the numbering skips a beat; carry
    straight on to §9.

## 9. First start and verification

36. From the repo root:
    `docker compose -f infra/compose.yaml --env-file .env up -d --build`
    The first build takes several minutes.
37. `docker compose -f infra/compose.yaml --env-file .env ps` — wait until
    `postgres`, `redis`, `web`, and `worker` all show **healthy** (there is no
    `cloudflared`; that's the tunnel profile, intentionally not running).
38. On the VM: `curl -ik https://<SITE_HOST>:8443/healthz` and
    `curl -ik https://<SITE_HOST>:8443/readyz` — both should return 200. Use
    the real `SITE_HOST` value, not `localhost`: Caddy selects its site block
    by the Host header, so `localhost` reaches the server but matches no site
    and 404s. `-k` only because the VM does not trust its own CA yet — the
    kiosk runbook §2 fixes that properly.
39. From a phone or laptop on the LAN, browse `https://<SITE_HOST>:8443` and
    accept the one-time certificate warning.
40. **Create the first account in the browser.** With no accounts in the
    database, `/` redirects to a one-time `/welcome` form — name, email,
    password — that creates the operator account and signs you in (ADR 0004).
    The email is only a username; nothing is sent to it. Once that account
    exists the route 404s and never comes back.

    There is no terminal step here any more. `create-operator.js` still exists
    but is now only for **resetting a forgotten password** — see ADR 0003 and
    the command in its docstring.

**Troubleshooting**

| Symptom | Likely cause / fix |
|---|---|
| `bind: address already in use` on 8443 | Something else owns the port. `sudo ss -ltnp 'sport = :8443'` to see what; move it or pick a different published port in `infra/compose.yaml` (and update `APP_URL`). |
| `permission denied ... docker.sock` | Step 27's group change hasn't taken effect — log out and back in (or reboot). Don't reflex to `sudo docker`; fix the group. |
| Containers stuck in `health: starting` | Normal for the first minute — healthchecks have 20–30 s `start_period` and web builds Next.js on first run. Judge after two minutes, then `docker compose -f infra/compose.yaml --env-file .env logs web`. |
| Reachable on the VM but not from the LAN | If you enabled UFW: Docker's published ports bypass UFW, so 8443 usually still works — but SSH does not; make sure `sudo ufw allow 22/tcp` (or your LAN subnet) is in place before enabling it. Ubuntu ships with UFW inactive; leaving it off on this LAN-only box is fine. Otherwise check you're on the same subnet/VLAN as the VM. |
| `curl` 200 but browser page errors | Check `web` logs for a bad `.env` value — the compose file fails fast on missing variables but cannot catch a typo'd `DATABASE_URL` password. |
