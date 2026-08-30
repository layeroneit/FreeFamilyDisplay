import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/sessions";
import { getBoard } from "@/lib/board/boards";
import { WIDGET_META } from "@/lib/board/widgets";
import { themeById, themeVars } from "@/lib/themes";
import { BoardCanvas } from "@/components/board/canvas";
import { WidgetFrame } from "@/components/board/widget-frame";
import { loadBoardData } from "@/components/board/render-data";
import { WidgetView } from "@/components/board/widget-view";
import { RefreshTimer } from "@/app/status/refresh-timer";

export const dynamic = "force-dynamic";

/**
 * Full-screen preview — the same renderer the kiosk will use in Phase 4,
 * minus the device token. Session-gated for now.
 */
export default async function BoardViewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const board = await getBoard(user.id, id);
  if (!board) notFound();
  const data = await loadBoardData(board, user.displayName);

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#000" }}>
      <RefreshTimer intervalMs={5 * 60_000} />
      <div className="h-full w-full">
        <BoardCanvas vars={themeVars(themeById(board.theme))} className="h-full">
          {board.widgets.map((w) => (
            <WidgetFrame key={w.id} type={w.type} x={w.x} y={w.y} w={w.w} h={w.h} z={w.z} plain={WIDGET_META[w.type].plain}>
              <WidgetView widget={w} data={data} />
            </WidgetFrame>
          ))}
        </BoardCanvas>
      </div>
    </div>
  );
}
