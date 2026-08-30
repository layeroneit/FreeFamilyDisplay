/**
 * Cross-tenant isolation (CLAUDE.md §"Things that are not optional"): user B
 * must not be able to read, change, or delete user A's board or widgets by id.
 *
 * Needs a real Postgres (runs in CI against a service container; run locally
 * with `npm run test:db` and DATABASE_URL pointing at a migrated database).
 * Skips cleanly when no database is reachable so `npm test` stays green on a
 * laptop without one.
 *
 * Run with `--conditions react-server` so the `server-only` guard in the
 * repository module resolves to its no-op build.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@ffd/db";
import { addWidget, createBoard, deleteBoard, getBoard, listBoards, removeWidget, updateBoard, updateWidget } from "./boards";

async function dbReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

test("cross-tenant isolation: boards and widgets", async (t) => {
  if (!process.env.DATABASE_URL || !(await dbReachable())) {
    t.skip("no reachable DATABASE_URL — tenancy test runs in CI against Postgres");
    return;
  }

  const stamp = Date.now();
  const a = await prisma.user.create({ data: { email: `tenant-a-${stamp}@test.local`, displayName: "A" } });
  const b = await prisma.user.create({ data: { email: `tenant-b-${stamp}@test.local`, displayName: "B" } });

  try {
    const boardId = await createBoard(a.id, { name: "A's kitchen", theme: "midnight", widgets: ["clock", "notes"] });
    const mine = await getBoard(a.id, boardId);
    assert.ok(mine, "owner can read own board");
    const widgetId = mine.widgets[0]!.id;

    // B cannot see it in a list, nor fetch it by id.
    assert.equal((await listBoards(b.id)).length, 0);
    assert.equal(await getBoard(b.id, boardId), null);

    // B cannot rename, retheme, or delete it.
    assert.equal(await updateBoard(b.id, boardId, { name: "hijacked" }), false);
    assert.equal(await deleteBoard(b.id, boardId), false);

    // B cannot add to it, move its widgets, change their config, or remove them.
    assert.equal(await addWidget(b.id, boardId, "quote", {}), null);
    assert.equal(await updateWidget(b.id, boardId, widgetId, { geometry: { x: 0, y: 0, w: 400, h: 200, z: 0 } }), false);
    assert.equal(await updateWidget(b.id, boardId, widgetId, { config: { text: "pwned" } }), false);
    assert.equal(await removeWidget(b.id, boardId, widgetId), false);

    // And nothing changed for A.
    const after = await getBoard(a.id, boardId);
    assert.ok(after);
    assert.equal(after.name, "A's kitchen");
    assert.equal(after.widgets.length, 2);
    assert.deepEqual(after.widgets.map((w) => w.id).sort(), mine.widgets.map((w) => w.id).sort());
  } finally {
    // Cascade removes boards and widgets.
    await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  }
});
