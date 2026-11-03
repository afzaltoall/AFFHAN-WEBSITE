"use client";

import { usePathname } from "next/navigation";
import { Bar, CardSkeleton } from "@/components/admin/AdminSkeleton";

/**
 * Shown while a console page loads (the dashboard's queries take about a second warm, three after Neon has slept), so
 * the previous page does not sit there frozen.
 *
 * Only the content. The rail is already on screen: the layout's (AdminFrame) beside every page but the dashboard.
 * This used to draw a 240px sidebar of its own, so moving between two pages put a second sidebar beside the rail,
 * and moving to the dashboard, which draws its own 60px rail, swapped the rail for a wide grey one and back again:
 * the page jumped twice (the owner, 2026-11-03: "a stuck of glitch is happening from one to another"). On the way to
 * the dashboard, a placeholder of exactly its rail's size holds the place, so nothing moves when the rail arrives.
 */
export default function AdminLoading() {
  const pathname = usePathname() ?? "";
  const dashboard = pathname === "/admin" || pathname === "/admin/";
  return (
    <div className="flex min-h-screen bg-[#f5f5f7]" aria-busy="true">
      <span className="sr-only" role="status">
        Loading…
      </span>
      {dashboard && (
        <div aria-hidden className="hidden w-[60px] shrink-0 rail:block">
          <div className="sticky top-0 h-screen border-r border-black/[0.06] bg-white/80" />
        </div>
      )}
      <main className="min-w-0 flex-1 animate-pulse px-5 pb-16 pt-6 sm:px-8">
        <Bar className="h-8 w-44" />
        <Bar className="mt-2 h-[13px] w-56" />
        {dashboard ? (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <CardSkeleton key={i} className="p-5">
                  <Bar className="h-9 w-9 rounded-xl" />
                  <Bar className="mt-3 h-7 w-16" />
                  <Bar className="mt-2 h-[12px] w-20" />
                </CardSkeleton>
              ))}
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {[0, 1].map((panel) => (
                <CardSkeleton key={panel} className="overflow-hidden">
                  <div className="border-b border-black/[0.06] px-5 py-4">
                    <Bar className="h-[14px] w-32" />
                  </div>
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="flex items-center gap-3 border-b border-black/[0.06] px-5 py-3.5 last:border-0">
                      <Bar className="h-9 w-9 rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <Bar className="h-[13px] w-3/5" />
                        <Bar className="mt-1.5 h-[11px] w-2/5" />
                      </span>
                    </div>
                  ))}
                </CardSkeleton>
              ))}
            </div>
          </>
        ) : (
          // Any other page: a list in a card, which is what nearly all of them are.
          <CardSkeleton className="mt-6 overflow-hidden">
            <div className="border-b border-black/[0.06] px-5 py-4">
              <Bar className="h-[14px] w-40" />
            </div>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-black/[0.06] px-5 py-3.5 last:border-0">
                <Bar className="h-8 w-8 rounded-full" />
                <span className="min-w-0 flex-1">
                  <Bar className="h-[13px] w-2/5" />
                  <Bar className="mt-1.5 h-[11px] w-1/4" />
                </span>
                <Bar className="h-[13px] w-16" />
              </div>
            ))}
          </CardSkeleton>
        )}
      </main>
    </div>
  );
}
