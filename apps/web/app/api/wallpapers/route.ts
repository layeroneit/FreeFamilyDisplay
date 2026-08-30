import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/sessions";
import { listCollections } from "@/lib/board/wallpapers";

export const dynamic = "force-dynamic";

/** Collections the signed-in user may choose from: built-ins plus their own. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ collections: await listCollections(user.id) });
}
