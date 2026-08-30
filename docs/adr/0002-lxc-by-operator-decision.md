# ADR 0002 — Run in the existing LXC, superseding ADR 0001

**Status:** Accepted — 2026-08-29 · **Supersedes:** ADR 0001

## Context

ADR 0001 chose an Ubuntu VM over an LXC, mainly for storage-layering simplicity
under Postgres and a cleaner restore story. During deployment, the guest that
actually existed on that host ("FreeDisplay", 192.168.1.50) turned out to be an
LXC. Asked directly, with the tradeoffs restated, the operator chose to proceed
on the LXC rather than create the VM.

This is an operator decision about their own infrastructure, made with the
consequences in view. It is recorded here so the documentation matches reality
— an ADR that disagrees with production is worse than no ADR at all.

## Decision

FreeFamilyDisplay runs in the existing **Ubuntu 24.04 LXC** on that host.

Preconditions before Docker is installed (operator actions, Proxmox web UI):

1. **Root disk grown to 40 GB** (found at 7.8 GB — insufficient for the Docker
   images, Postgres data, and photo cache; plan §9 sizes this at 40 GB).
2. **`nesting` feature enabled** (and `keyctl` if the container is
   unprivileged), then a container restart. Docker does not start without it.

## Consequences

**Accepted costs.** Docker's overlay2 now stacks on the LXC filesystem on host
storage — the three-layer arrangement ADR 0001 avoided. The Phase 1 restore
drill must be exercised against exactly this stack, which makes the
"restore proven, not assumed" requirement (plan §3.6, §9) *more* important,
not less. The container shares the host kernel, so kernel-level isolation
between Hearth and the host is namespacing, not virtualization.

**Unchanged.** Every container-hardening rule in plan §8.7 still applies:
non-root UIDs, read-only rootfs with explicit tmpfs, `cap_drop: ALL`,
`no-new-privileges`, Postgres and Redis never published to the guest interface.
The §7.8 Raspberry Pi renderer budget, the SSRF guard, and all
application-layer security are unaffected.

**Simplifications.** No QEMU guest agent (Proxmox manages LXCs natively), lower
memory floor, faster boot. `vzdump` of the container per existing host practice
continues to apply (plan §9).

## Revisit trigger

If the restore drill against this stack fails or proves fragile, that is the
signal to migrate to the ADR 0001 VM — the compose stack is host-agnostic, so
migration is: stand up VM, restore backup, repoint DNS/tunnel and displays.
