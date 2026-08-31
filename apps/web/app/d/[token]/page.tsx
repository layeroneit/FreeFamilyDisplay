import { notFound } from "next/navigation";
import { WIDGET_META, canvasSize, safeWidgetConfig, textScale } from "@/lib/board/widgets";
import { themeById, themeVars } from "@/lib/themes";
import { BoardCanvas } from "@/components/board/canvas";
import { BoardBackdrop } from "@/components/board/backdrop";
import { WidgetFrame } from "@/components/board/widget-frame";
import { loadBoardScene } from "@/components/board/render-data";
import { WidgetView } from "@/components/board/widget-view";
import { SeasonalFrame } from "@/components/board/seasonal-frame";
import { BirthdayCelebration } from "@/components/board/birthday-celebration";
import { RefreshTimer } from "@/app/status/refresh-timer";
import { boardForDisplayToken } from "@/lib/board/display-links";

export const dynamic = "force-dynamic";

/**
 * The wall-screen URL (plan §8.2). Reached by token, holds no session, and
 * renders one board read-only — there is no navigation off this page and no
 * control that writes. This is what a Raspberry Pi in a hallway points at:
 * paste it once into the kiosk browser and never touch it again.
 *
 * Deliberately not indexed and not linkable back into the admin UI: whoever
 * holds the URL sees this board, so it is treated as a bearer credential and
 * kept off search engines and out of referrer headers.
 */
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default async function DisplayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const board = await boardForDisplayToken(token);
  if (!board) notFound();

  // The greeting says the household's name, not a viewer's — nobody is signed in.
  const scene = await loadBoardScene(board, board.name);
  const size = canvasSize(board.canvas);
  const vars = { ...themeVars(themeById(board.theme)), ...scene.varOverrides };

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#000" }}>
      <RefreshTimer intervalMs={5 * 60_000} />
      <div className="h-full w-full">
        <BoardCanvas vars={vars} width={size.w} height={size.h} className="h-full">
          <BoardBackdrop wallpaper={scene.wallpaper} scrimOpacity={scene.scrimOpacity} mood={scene.mood} canvasW={size.w} effects rightsNote={scene.rightsNote} />
          {board.style.seasonalDecor ? <SeasonalFrame now={scene.data.now} canvasW={size.w} canvasH={size.h} /> : null}
          {board.widgets.map((w) => (
            <WidgetFrame
              key={w.id}
              type={w.type}
              x={w.x}
              y={w.y}
              w={w.w}
              h={w.h}
              z={10 + w.z}
              plain={WIDGET_META[w.type].plain}
              translucent={scene.wallpaper !== null}
              scale={textScale(w.type, w.w, w.h, (safeWidgetConfig(w.type, w.config) as { fontScale: number }).fontScale)}
            >
              <WidgetView widget={w} data={scene.data} />
            </WidgetFrame>
          ))}
          {scene.birthdays.length > 0 ? <BirthdayCelebration names={scene.birthdays} canvasW={size.w} canvasH={size.h} /> : null}
        </BoardCanvas>
      </div>
    </div>
  );
}
