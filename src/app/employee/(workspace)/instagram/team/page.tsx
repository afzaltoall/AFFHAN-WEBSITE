import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readWorkspaceAuth } from "@/lib/employee-session";
import { instagramBoard, isInstagramTracker, isMissingInstagramTables } from "@/lib/server/instagram-task";
import { InstagramBoard } from "@/components/instagram/InstagramBoard";
import { InstagramViews } from "@/components/instagram/InstagramViews";
import { InstagramAdminNote, InstagramNotSetUp, InstagramPageHead } from "@/components/instagram/InstagramPageHead";
import type { InstagramBoardView } from "@/lib/instagram-task-shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Instagram task, everyone — Affhan staff",
  robots: { index: false, follow: false },
};

/**
 * Everyone in the Instagram task, for a tracker (HR; the console names them): who has added how many accounts, what
 * each shows, what waits for a check, and the check itself, on anyone's accounts but their own. Anyone else is sent to
 * their own page. Live: the board reads itself again every half minute (InstagramBoard).
 */
export default async function InstagramTeamPage() {
  const auth = await readWorkspaceAuth();
  if (!auth.ok) return null;
  if (auth.kind === "admin") return <InstagramAdminNote />;
  if (!(await isInstagramTracker(auth.employee.id))) redirect("/employee/instagram/");
  let board: InstagramBoardView;
  try {
    board = await instagramBoard();
  } catch (e) {
    if (isMissingInstagramTables(e)) return <InstagramNotSetUp />;
    throw e;
  }
  return (
    <div className="space-y-5">
      <InstagramPageHead settings={board.settings} refresh={false} />
      <InstagramViews at="everyone" />
      <InstagramBoard initial={board} api="/api/instagram-task" me={auth.employee.id} admin={false} />
    </div>
  );
}
