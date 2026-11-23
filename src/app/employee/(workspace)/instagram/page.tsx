import type { Metadata } from "next";
import { readWorkspaceAuth } from "@/lib/employee-session";
import { isMissingInstagramTables, myInstagram, type MyInstagramView } from "@/lib/server/instagram-task";
import { InstagramMine } from "@/components/instagram/InstagramMine";
import { InstagramViews } from "@/components/instagram/InstagramViews";
import { InstagramAdminNote, InstagramNotSetUp, InstagramPageHead } from "@/components/instagram/InstagramPageHead";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Instagram task — Affhan staff",
  robots: { index: false, follow: false },
};

/**
 * The office's Instagram task (the owner, 2026-11-23), an employee's own: every account has it, whatever its job, HR's
 * too. Their accounts and counts, HR's checks, the prize. A tracker (HR) also has Everyone, beside it.
 */
export default async function InstagramTaskPage() {
  const auth = await readWorkspaceAuth();
  if (!auth.ok) return null;
  if (auth.kind === "admin") return <InstagramAdminNote />;
  let view: MyInstagramView;
  try {
    view = await myInstagram(auth.employee.id);
  } catch (e) {
    if (isMissingInstagramTables(e)) return <InstagramNotSetUp />;
    throw e;
  }
  return (
    <div className="space-y-5">
      <InstagramPageHead settings={view.settings} />
      {view.tracker && <InstagramViews at="mine" />}
      <InstagramMine settings={view.settings} accounts={view.accounts} prize={view.prize} tracker={view.tracker} />
    </div>
  );
}
