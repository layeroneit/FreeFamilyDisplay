import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/sessions";
import { termsCurrent } from "@/lib/terms";
import { getBoard } from "@/lib/board/boards";
import { publicWidgetConfig } from "@/lib/board/widgets";
import { listCollections } from "@/lib/board/wallpapers";
import { THEMES, themeById, themeVars } from "@/lib/themes";
import { BoardBackdrop } from "@/components/board/backdrop";
import { loadBoardScene } from "@/components/board/render-data";
import { WidgetView } from "@/components/board/widget-view";
import { BoardEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!termsCurrent(user)) redirect("/terms");
  const { id } = await params;
  const board = await getBoard(user.id, id);
  if (!board) notFound();

  const [scene, collections] = await Promise.all([loadBoardScene(board, user.displayName), listCollections(user.id)]);

  // Server-rendered widget content, handed to the client editor by id so the
  // editor owns geometry (drag/resize) without re-implementing any renderer.
  // Configs are stripped of secrets before they become client props.
  const slots: Record<string, ReactNode> = {};
  for (const w of board.widgets) slots[w.id] = <WidgetView widget={w} data={scene.data} />;

  return (
    <BoardEditor
      board={{
        id: board.id,
        name: board.name,
        theme: board.theme,
        canvas: board.canvas,
        wallpaperCollectionId: board.wallpaperCollectionId,
        wallpaperRotation: board.wallpaperRotation,
        wallpaperOrder: board.wallpaperOrder,
        scrimOpacityOverride: board.scrimOpacityOverride,
        matchPaletteToWallpaper: board.matchPaletteToWallpaper,
        weatherMood: board.weatherMood,
        weatherMoodStrength: board.weatherMoodStrength,
        pinned: board.style.wallpaperPinned === board.currentWallpaperId && board.currentWallpaperId !== null,
      }}
      widgets={board.widgets.map((w) => ({ ...w, config: publicWidgetConfig(w.type, w.config) }))}
      slots={slots}
      themes={THEMES}
      vars={{ ...themeVars(themeById(board.theme)), ...scene.varOverrides }}
      hasWallpaper={scene.wallpaper !== null}
      wallpaperCredit={scene.wallpaper ? `${scene.wallpaper.attribution.photographer} · ${scene.wallpaper.attribution.source}` : null}
      suggestedScrim={scene.wallpaper?.suggestedScrimOpacity ?? null}
      collections={collections}
      moodLabel={scene.mood?.label ?? null}
      backdrop={<BoardBackdrop wallpaper={scene.wallpaper} scrimOpacity={scene.scrimOpacity} mood={scene.mood} canvasW={board.canvas === "ULTRAWIDE" ? 2560 : 1920} effects />}
    />
  );
}
