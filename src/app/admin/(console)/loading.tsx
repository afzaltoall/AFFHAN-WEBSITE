"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { AdminLoadingScreen } from "@/components/admin/AdminSkeleton";
import { AdminRail } from "@/components/admin/AdminRail";
import { addressOf, isDashboardPath, useAdminNav } from "@/components/admin/admin-nav";

/**
 * Shown while a console page loads (the dashboard's queries take about a second warm, three after Neon has slept), so
 * the previous page does not sit there frozen.
 *
 * Only the content beside every page but the dashboard: the frame's rail (AdminFrame) is already there. This used to
 * draw a 240px sidebar of its own, so moving between two pages put a second sidebar beside the rail, and the page
 * jumped twice (the owner, 2026-11-03: "a stuck of glitch is happening from one to another"). The dashboard draws its
 * own rail, which the frame leaves out, so on the way there this draws the real rail, rows and figures, with the row
 * being opened marked, in exactly the dashboard rail's place: nothing to press was missing while it loaded, and
 * nothing moves when the dashboard arrives.
 */
export default function AdminLoading() {
  const pathname = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";
  const { rail } = useAdminNav();
  if (!isDashboardPath(pathname)) return <AdminLoadingScreen dashboard={false} />;
  return (
    <div className="flex">
      <AdminRail name={rail.name} image={rail.image} counts={rail.counts} at={addressOf(pathname, search)} />
      <div className="min-w-0 flex-1">
        <AdminLoadingScreen dashboard />
      </div>
    </div>
  );
}
