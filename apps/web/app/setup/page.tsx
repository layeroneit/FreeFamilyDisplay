import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/sessions";
import { THEMES, isThemeId } from "@/lib/themes";
import { SetupWizard } from "./wizard";

export const metadata = { title: "Set up a display — FreeFamilyDisplay" };
export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const fromQuery = sp.theme && isThemeId(sp.theme) ? sp.theme : null;
  const initialTheme = fromQuery ?? user.uiTheme ?? "midnight";
  return (
    <main className="min-h-dvh px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <SetupWizard
          themes={THEMES}
          initialTheme={initialTheme}
          viewerName={user.displayName}
          startStep={fromQuery ? 2 : 0}
        />
      </div>
    </main>
  );
}
