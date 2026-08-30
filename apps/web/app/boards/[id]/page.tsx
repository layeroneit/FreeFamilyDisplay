import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/sessions";
import { getBoard } from "@/lib/board/boards";
import { THEMES } from "@/lib/themes";
import { loadBoardData } from "@/components/board/render-data";
import { WidgetView } from "@/components/board/widget-view";
import { BoardEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const board = await getBoard(user.id, id);
  if (!board) notFound();

  const data = await loadBoardData(board, user.displayName);

  // Server-rendered widget content, handed to the client editor by id so the
  // editor owns geometry (drag/resize) without re-implementing any renderer.
  const slots: Record<string, ReactNode> = {};
  for (const w of board.widgets) slots[w.id] = <WidgetView widget={w} data={data} />;

  return (
    <BoardEditor
      board={{ id: board.id, name: board.name, theme: board.theme }}
      widgets={board.widgets}
      slots={slots}
      themes={THEMES}
    />
  );
}
