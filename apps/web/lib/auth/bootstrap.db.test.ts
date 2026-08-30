/**
 * First-run bootstrap (ADR 0004). The property under test: the door that lets
 * a stranger create the first account closes the moment one exists, closes
 * exactly once under a simultaneous double submission, and is held shut by the
 * advisory lock rather than by luck.
 *
 * `instanceClaimed()` is the single predicate behind both gates — /welcome
 * calls it to decide notFound(), and the claim route calls it before doing any
 * work — so asserting it here asserts the route is gone. `claimInstance()` is
 * asserted separately because it is the one that must hold under a race; the
 * page gate is a courtesy, this is the guarantee.
 *
 * Needs a real Postgres AND AN EMPTY user table — the whole subject is what
 * happens at zero users, and there is no honest way to fake that. It therefore
 * SKIPS rather than deleting anybody's accounts to make room for itself. Run
 * with `npm run test:bootstrap` against a freshly migrated database; CI runs it
 * before the tenancy test, which is what leaves the table empty.
 *
 * Run with `--conditions react-server` so the `server-only` guard in the
 * bootstrap module resolves to its no-op build.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@ffd/db";
import {
  CLAIM_LOCK_ID,
  CLAIM_LOCK_NAMESPACE,
  claimInstance,
  instanceClaimed,
  type ClaimResult,
} from "./bootstrap";
import { verifyPassword } from "./password";

const PASSWORD = "the kitchen tablet is on the wall";

/** Every email this file may ever insert — the cleanup net, see `wipe()`. */
const TEST_EMAILS = [
  "first@test.local",
  "second@test.local",
  "third@test.local",
  "too-short@test.local",
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dbReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes anything this file created. Keyed on the fixed email list rather
 * than on ids collected as we go: an assertion failing BETWEEN the insert and
 * the bookkeeping would otherwise leave a live OPERATOR account behind, whose
 * password is a string literal at the top of this file, on whatever database
 * the test was pointed at. That account would also claim the instance,
 * permanently 404-ing /welcome for its real owner.
 *
 * Audit rows carry no foreign key to User, so they do not cascade.
 */
async function wipe(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { in: TEST_EMAILS } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

test("first-run bootstrap: claim once, then the door is gone", async (t) => {
  if (!process.env.DATABASE_URL || !(await dbReachable())) {
    t.skip("no reachable DATABASE_URL — bootstrap test runs in CI against Postgres");
    return;
  }
  if ((await prisma.user.count()) > 0) {
    t.skip("user table is not empty — refusing to delete accounts to test the zero-user path");
    return;
  }

  try {
    // -------------------------------------------------------------- unclaimed
    assert.equal(await instanceClaimed(), false, "a database with no users is unclaimed");

    // A password below the policy is refused, and refusing it must not claim
    // the instance as a side effect.
    const weak = await claimInstance({
      email: "too-short@test.local",
      displayName: "Nope",
      password: "short",
    });
    assert.equal(weak.ok, false);
    assert.equal(weak.ok === false && weak.reason, "weak-password");
    assert.equal(await instanceClaimed(), false, "a rejected claim leaves the instance unclaimed");
    assert.equal(await prisma.user.count(), 0);

    // ------------------------------------------------------------------ race
    // Two submissions at the same instant, different addresses — the case a
    // plain `if (count === 0)` fails, because at READ COMMITTED both
    // transactions truthfully see an empty table. Exactly one may win.
    const [a, b] = await Promise.all([
      claimInstance({ email: "First@Test.Local", displayName: "  First  ", password: PASSWORD }),
      claimInstance({ email: "second@test.local", displayName: "Second", password: PASSWORD }),
    ]);
    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    assert.equal(winners.length, 1, "exactly one simultaneous claim succeeds");
    assert.equal(losers.length, 1);
    assert.equal(losers[0]!.ok === false && losers[0]!.reason, "already-claimed");

    const users = await prisma.user.findMany({
      select: { id: true, email: true, displayName: true, role: true, passwordHash: true },
    });
    assert.equal(users.length, 1, "the race created exactly one account, not two");

    const owner = users[0]!;
    assert.equal(winners[0]!.ok === true && winners[0]!.userId, owner.id);
    assert.equal(owner.role, "OPERATOR", "the first account owns the instance");
    // Compared against LITERALS, not against a transform of the stored value:
    // `owner.email === owner.email.toLowerCase()` passes whatever the code
    // does, every time the already-normalized contender wins the race.
    // "First@Test.Local" and "  First  " are the inputs that can catch a
    // missing .toLowerCase()/.trim(), so both allowed values are spelled out.
    assert.ok(
      ["first@test.local", "second@test.local"].includes(owner.email),
      `email not normalized: ${owner.email}`,
    );
    assert.ok(
      ["First", "Second"].includes(owner.displayName),
      `displayName not trimmed: ${owner.displayName}`,
    );
    assert.ok(owner.passwordHash, "the first account has a password hash");
    assert.equal(await verifyPassword(PASSWORD, owner.passwordHash), true);
    assert.notEqual(owner.passwordHash, PASSWORD, "the password is hashed, not stored");

    // The claim is on the record.
    const claimed = await prisma.auditLog.findFirst({
      where: { action: "instance.claimed", actorId: owner.id },
    });
    assert.ok(claimed, "claiming the instance writes an audit row");

    // --------------------------------------------------------------- claimed
    // This is the assertion that /welcome is gone: the page renders notFound()
    // on exactly this predicate.
    assert.equal(await instanceClaimed(), true);

    // And the door is shut on the server side too, not only in the UI —
    // including for the address that lost the race a moment ago.
    const late = await claimInstance({
      email: "second@test.local",
      displayName: "Second",
      password: PASSWORD,
    });
    assert.equal(late.ok, false);
    assert.equal(late.ok === false && late.reason, "already-claimed");
    assert.equal(await prisma.user.count(), 1);
  } finally {
    await wipe();
  }
});

/**
 * The race test above asserts the OUTCOME. It does not prove the MECHANISM:
 * whenever one contender's bcrypt finishes early enough that its transaction
 * commits before the other's even opens, the loser takes an uncontended lock,
 * and the test would still pass with the lock line deleted.
 *
 * This one proves the mechanism. It holds the claim lock in a transaction of
 * its own, starts a claim, and asserts the claim is still unsettled long
 * afterwards — then that it completes only once the lock is released. Delete
 * `pg_advisory_xact_lock` from bootstrap.ts and this fails.
 */
test("first-run bootstrap: a claim blocks while the advisory lock is held", async (t) => {
  if (!process.env.DATABASE_URL || !(await dbReachable())) {
    t.skip("no reachable DATABASE_URL — bootstrap test runs in CI against Postgres");
    return;
  }
  if ((await prisma.user.count()) > 0) {
    t.skip("user table is not empty — refusing to delete accounts to test the zero-user path");
    return;
  }

  let release!: () => void;
  const releaseSignal = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acquired!: () => void;
  const lockAcquired = new Promise<void>((resolve) => {
    acquired = resolve;
  });

  // Generous timeout: this transaction deliberately idles while holding the
  // lock. It is still bounded, so a broken test fails rather than hanging.
  const holder = prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLAIM_LOCK_NAMESPACE}::int, ${CLAIM_LOCK_ID}::int)`;
      acquired();
      await releaseSignal;
    },
    { timeout: 20_000 },
  );

  try {
    await lockAcquired;

    let settled = false;
    const pending: Promise<ClaimResult> = claimInstance({
      email: "third@test.local",
      displayName: "Third",
      password: PASSWORD,
    });
    void pending.then(
      () => (settled = true),
      () => (settled = true),
    );

    // Comfortably longer than a bcrypt-cost-12 hash, which happens BEFORE the
    // transaction opens and must not be mistaken for the lock doing the work.
    await sleep(2000);
    assert.equal(settled, false, "a claim must not complete while the claim lock is held");
    assert.equal(await prisma.user.count(), 0, "and it must not have inserted anything yet");

    const releasedAt = Date.now();
    release();
    await holder;

    const result = await pending;
    // Resolving only after the release rules out "it was just slow for some
    // other reason" — the claim was waiting on this lock specifically.
    assert.ok(Date.now() >= releasedAt, "the claim resolved only after the lock was released");
    assert.equal(result.ok, true, "and it succeeds once the lock is free");
    assert.equal(await prisma.user.count(), 1);
  } finally {
    release();
    await holder.catch(() => undefined);
    await wipe();
    await prisma.$disconnect();
  }
});
