import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { instagramBoard, isMissingInstagramTables } from "@/lib/server/instagram-task";
import { InstagramTaskConsole } from "@/components/admin/InstagramTaskConsole";
import type { InstagramBoardView } from "@/lib/instagram-task-shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Instagram task | Affhan Admin",
  robots: { index: false, follow: false },
};

/**
 * Team → Instagram task (the owner, 2026-11-23): the office's Instagram task, its settings, its trackers (HR) and
 * everyone's accounts. Read here on every request; the board reads itself again every half minute and its presses
 * write through /api/admin/instagram-task/.
 */
export default async function InstagramTaskPage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");
  let board: InstagramBoardView;
  try {
    board = await instagramBoard();
  } catch (e) {
    if (!isMissingInstagramTables(e)) throw e;
    return (
      <div className="min-h-screen bg-[#f5f5f7] px-5 py-8 text-[#1d1d1f] sm:px-8 lg:px-10">
        <h1 className="text-2xl font-semibold tracking-tight">Instagram task</h1>
        <p className="mt-2 text-[14px] text-[#48484a]">The Instagram task isn&apos;t set up on this database yet: its migration has not been applied.</p>
      </div>
    );
  }
  return <InstagramTaskConsole board={board} />;
}
