import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/sessions";
import { termsCurrent } from "@/lib/terms";
import { fetchDropFolders } from "@/lib/board/worker-poke";

export const dynamic = "force-dynamic";

/**
 * Sub-directories of the server's wallpaper drop folder, so the editor can
 * offer them instead of asking the user to type a name. Names and counts
 * only — no paths, and nothing about the host filesystem beyond the drop root.
 * Operator only: see the role check below.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!termsCurrent(user)) return NextResponse.json({ error: "Accept the agreement first." }, { status: 403 });
  // The drop root is shared by the whole instance and nothing ties a folder to
  // a household, so only the operator who fills it may list or use it.
  if (user.role !== "OPERATOR") return NextResponse.json({ error: "Server folders are for the operator only." }, { status: 403 });
  return NextResponse.json({ folders: await fetchDropFolders() });
}
