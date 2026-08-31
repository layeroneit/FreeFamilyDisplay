import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/sessions";
import { termsCurrent } from "@/lib/terms";
import { getBoard } from "@/lib/board/boards";
import { WIDGET_META, canvasSize, safeWidgetConfig, textScale } from "@/lib/board/widgets";
import { themeById, themeVars } from "@/lib/themes";
import { BoardCanvas } from "@/components/board/canvas";
import { BoardBackdrop } from "@/components/board/backdrop";
import { WidgetFrame } from "@/components/board/widget-frame";
import { loadBoardScene } from "@/components/board/render-data";
import { WidgetView } from "@/components/board/widget-view";
import { BirthdayCelebration } from "@/components/board/birthday-celebration";
import { RefreshTimer } from "@/app/status/refresh-timer";
import { KioskControls } from "./kiosk-controls";

export const dynamic = "force-dynamic";

/**
 * The wall-screen renderer. Session-gated until Phase 4 adds device tokens:
 * sign in once on the screen's browser (90-day session), open the board,
 * tap Start. The overlay detects the screen's shape and offers to switch
 * the display to match.
 */
export default async function BoardViewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!termsCurrent(user)) redirect("/terms");
  const { id } = await params;
  const board = await getBoard(user.id, id);
  if (!board) notFound();
  const scene = await loadBoardScene(board, user.displayName);
  const size = canvasSize(board.canvas);
  const vars = { ...themeVars(themeById(board.theme)), ...scene.varOverrides };

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#000" }}>
      <RefreshTimer intervalMs={5 * 60_000} />
      <KioskControls boardId={board.id} canvas={board.canvas} />
      <div className="h-full w-full">
        <BoardCanvas vars={vars} width={size.w} height={size.h} className="h-full">
          <BoardBackdrop wallpaper={scene.wallpaper} scrimOpacity={scene.scrimOpacity} mood={scene.mood} canvasW={size.w} effects rightsNote={scene.rightsNote} />
          {board.widgets.map((w) => (
            <WidgetFrame key={w.id} type={w.type} x={w.x} y={w.y} w={w.w} h={w.h} z={10 + w.z} plain={WIDGET_META[w.type].plain} translucent={scene.wallpaper !== null} scale={textScale(w.type, w.w, w.h, (safeWidgetConfig(w.type, w.config) as { fontScale: number }).fontScale)}>
              <WidgetView widget={w} data={scene.data} />
            </WidgetFrame>
          ))}
          {scene.birthdays.length > 0 ? <BirthdayCelebration names={scene.birthdays} canvasW={size.w} canvasH={size.h} /> : null}
        </BoardCanvas>
      </div>
    </div>
  );
}
