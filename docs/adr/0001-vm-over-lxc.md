# ADR 0001 — Run in an Ubuntu VM, not an unprivileged LXC

**Status:** ~~Accepted~~ **Superseded by ADR 0002** (2026-08-29, same day —
operator chose the existing LXC during deployment)
**Supersedes:** the first sentence of plan §8.7

## Context

Plan §8.7 specifies "unprivileged LXC, Debian 13, nesting enabled." The host is
Proxmox VE (the operator’s own host), which serves both this project and another of theirs.

Docker inside an unprivileged LXC works, but it needs `nesting=1` and
`keyctl=1`, and it stacks Docker's `overlay2` on top of the LXC's filesystem on
top of the host's storage. For a Postgres container holding the only copy of
family calendar data, that is three storage layers to reason about during a
restore. §9 requires a *proven* restore in Phase 1 specifically because this host
has lost storage before.

## Decision

FreeFamilyDisplay runs in an **Ubuntu 24.04 LTS VM** on that host: 4 vCPU, 8 GB
RAM, 40 GB disk, separate from that project’s container.

Every container hardening rule in §8.7 still applies **inside** the VM:

- Non-root UID in every container
- `read_only: true` rootfs with explicit tmpfs mounts
- `cap_drop: ALL`, `no-new-privileges: true`
- Postgres and Redis on the internal Compose network only, never published to
  the VM's host interface
- No Docker socket mounts, no `--privileged`
- Storage referenced by `/dev/disk/by-id` paths

## Consequences

**Better.** Real kernel isolation rather than shared-kernel namespacing. Docker
behaves the way its documentation says it does. Snapshot and `vzdump` semantics
are straightforward. The database sits on one fewer storage layer, which makes
the Phase 1 restore drill simpler to write and to trust.

**Worse.** Higher memory floor than an LXC — the guest kernel and systemd are
real overhead on a family-scale box. Slower to boot. Marginally more to patch,
since the VM has its own kernel.

**Neutral.** The VM changes the isolation boundary, not the security posture. A
reader who sees "VM" and concludes the container hardening was relaxed has
misread this document.

## Alternatives considered

**Unprivileged LXC on Ubuntu.** Keeps §8.7's shape while honoring the operator's
Ubuntu preference. Rejected for the Docker-in-LXC storage complexity above.

**Unprivileged LXC on Debian 13, exactly as written.** Rejected for the same
reason, and it ignores the stated Ubuntu preference for no gain.
