/**
 * Shows a board's widget geometry, and optionally gives one widget more height
 * by pushing whatever sits under it further down.
 *
 * Dragging a widget in the editor is the normal way to do this. This exists for
 * the case the editor is awkward for: a wall screen in portrait, where the
 * calendar wants a couple of hundred more pixels and four other widgets have to
 * shuffle down by exactly the same amount without anyone eyeballing it.
 *
 * Runs inside the worker container:
 *
 *   # look, change nothing
 *   docker compose -f infra/compose.yaml --env-file .env exec \
 *     worker node apps/worker/dist/board-layout.js
 *
 *   # give the calendar 860px of height, push the rest down
 *   docker compose -f infra/compose.yaml --env-file .env exec \
 *     -e BOARD=Hallway -e WIDGET=calendar -e HEIGHT=860 \
 *     worker node apps/worker/dist/board-layout.js
 *
 * Env vars rather than argv, matching create-operator.ts.
 *
 * It refuses rather than improvises. If the push would shove a widget off the
 * bottom of the canvas it names the widget and the overflow and writes nothing,
 * because a board that silently loses its photo frame is worse than a board
 * that stayed as it was.
 *
 * A note on what more height actually buys, because it is not what people
 * expect: widget text scales with widget AREA (lib/board/widgets textScale), so
 * a taller calendar mostly renders BIGGER, not longer. Going 520 -> 860 on a
 * portrait board takes the week view from one event a day to two. Getting to
 * three means lowering that widget's own text-size multiplier as well, which is
 * a slider in the editor and needs no script at all.
 */

import { prisma } from "@ffd/db";
import { createLogger } from "@ffd/log";

const log = createLogger("board-layout");

const CANVAS = { LANDSCAPE: { w: 1920, h: 1080 }, PORTRAIT: { w: 1080, h: 1920 }, ULTRAWIDE: { w: 2560, h: 1080 } };
const GRID = 20;
const snap = (n: number) => Math.round(n / GRID) * GRID;

const boardQuery = process.env.BOARD?.trim();
const widgetType = process.env.WIDGET?.trim().toLowerCase();
const targetHeight = process.env.HEIGHT ? Number(process.env.HEIGHT) : null;

type Row = { id: string; type: string; x: number; y: number; w: number; h: number; z: number };
type BoardRow = { id: string; name: string; canvas: keyof typeof CANVAS; widgets: Row[] };

function draw(rows: Row[], canvas: { w: number; h: number }): void {
  for (const r of [...rows].sort((a, b) => a.y - b.y)) {
    const bottom = r.y + r.h;
    const flag = bottom > canvas.h ? "  << off the bottom" : "";
    log.info(
      `${r.type.padEnd(10)} x${String(r.x).padStart(5)} y${String(r.y).padStart(5)}  ${String(r.w).padStart(5)}x${String(r.h).padStart(4)}  ends y=${bottom}${flag}`,
    );
  }
}

async function main(): Promise<void> {
  // `where` is spread in rather than set to undefined: exactOptionalPropertyTypes
  // rejects an explicit undefined. The annotation is needed because the
  // conditional argument widens the inferred select shape enough that
  // board.widgets stops being typed.
  const boards: BoardRow[] = await prisma.board.findMany({
    ...(boardQuery ? { where: { OR: [{ id: boardQuery }, { name: { contains: boardQuery, mode: "insensitive" as const } }] } } : {}),
    select: { id: true, name: true, canvas: true, widgets: { select: { id: true, type: true, x: true, y: true, w: true, h: true, z: true } } },
  });

  if (boards.length === 0) {
    log.error(boardQuery ? `No board matches ${JSON.stringify(boardQuery)}.` : "This instance has no boards yet.");
    process.exit(1);
  }

  // Read-only mode, or an ambiguous match: show the layout and stop.
  if (!widgetType || targetHeight === null) {
    for (const b of boards) {
      log.info(`--- ${b.name} (${b.canvas}, ${b.id}) ---`);
      draw(b.widgets, CANVAS[b.canvas]);
    }
    log.info("Set BOARD, WIDGET and HEIGHT to change one. Nothing was written.");
    return;
  }

  if (boards.length > 1) {
    log.error(`${boards.length} boards match ${JSON.stringify(boardQuery)}. Narrow BOARD to one, or pass its id.`);
    for (const b of boards) log.error(`  ${b.name}  ${b.id}`);
    process.exit(1);
  }

  const board = boards[0]!;
  const canvas = CANVAS[board.canvas];
  const target = board.widgets.find((x) => x.type === widgetType);
  if (!target) {
    log.error(`No ${widgetType} widget on "${board.name}". It has: ${board.widgets.map((x) => x.type).join(", ")}`);
    process.exit(1);
  }
  if (!Number.isFinite(targetHeight) || targetHeight < 80) {
    log.error(`HEIGHT must be a number of at least 80. Got ${JSON.stringify(process.env.HEIGHT)}.`);
    process.exit(1);
  }

  const newH = Math.min(snap(targetHeight), canvas.h - target.y);
  const delta = newH - target.h;
  if (delta === 0) {
    log.info(`${widgetType} is already ${newH}px tall. Nothing to do.`);
    return;
  }

  log.info(`--- ${board.name} (${board.canvas}) — before ---`);
  draw(board.widgets, canvas);

  // Anything starting at or below the widget's current bottom AND sharing its
  // column moves by the same delta, so the gaps the operator arranged are
  // preserved. The x-test matters both ways: without it, growing a left-column
  // calendar refuses because a right-column card "would fall off the bottom",
  // and shrinking one silently drags the side column up over its neighbours.
  const oldBottom = target.y + target.h;
  const overlapsX = (a: Row, b: Row) => a.x < b.x + b.w && b.x < a.x + a.w;
  const moved = board.widgets.filter((x) => x.id !== target.id && x.y >= oldBottom && overlapsX(x, target));
  const planned: Row[] = board.widgets.map((x) =>
    x.id === target.id ? { ...x, h: newH } : moved.some((m) => m.id === x.id) ? { ...x, y: snap(x.y + delta) } : x,
  );

  // Bottom edge AND pairwise overlap: a shrink moves widgets UP, where the
  // hazard is landing on a neighbour, not falling off the canvas.
  const collides = planned.filter((a) =>
    planned.some((b) => a.id < b.id && overlapsX(a, b) && a.y < b.y + b.h && b.y < a.y + a.h),
  );
  if (collides.length > 0) {
    log.error(`That would stack widgets on top of each other:`);
    for (const c of collides) log.error(`  ${c.type} at y=${c.y}`);
    log.error("Nothing was written.");
    process.exit(1);
  }
  const spilled = planned.filter((x) => x.y + x.h > canvas.h);
  if (spilled.length > 0) {
    log.error(`That would push ${spilled.length} widget(s) off the bottom of a ${canvas.w}x${canvas.h} canvas:`);
    for (const s of spilled) log.error(`  ${s.type} would end at y=${s.y + s.h}, which is ${s.y + s.h - canvas.h}px too far`);
    log.error("Nothing was written. Give the widget less height, or shrink one of those first.");
    process.exit(1);
  }

  await prisma.$transaction(
    planned
      .filter((p) => {
        const before = board.widgets.find((x) => x.id === p.id)!;
        return before.y !== p.y || before.h !== p.h;
      })
      .map((p) => prisma.boardWidget.update({ where: { id: p.id }, data: { y: p.y, h: p.h } })),
  );
  await prisma.board.update({ where: { id: board.id }, data: { updatedAt: new Date() } });

  log.info(`--- after (${widgetType} ${target.h} -> ${newH}, ${moved.length} widget(s) moved down ${delta}px) ---`);
  draw(planned, canvas);
  log.info("The wall screen picks this up on its next refresh, within five minutes.");
}

main()
  .catch((err: unknown) => {
    log.error("failed", { error: err instanceof Error ? err.message : String(err) });
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
