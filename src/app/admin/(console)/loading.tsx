import { Bar, CardSkeleton } from "@/components/admin/AdminSkeleton";

/**
 * Shown while the dashboard's thirteen queries run.
 *
 * That batch is latency-bound rather than heavy — every round trip to Neon in
 * us-east-1 costs about 450ms from here — so it lands in roughly a second warm
 * and three seconds after the free-tier compute has suspended itself. This is
 * what fills that gap instead of the previous page sitting there frozen.
 */
export default function AdminLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-[#f5f5f7]" aria-busy="true">
      <span className="sr-only" role="status">
        Loading dashboard…
      </span>
      <div className="flex">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-black/[0.06] bg-white/80 lg:flex">
          <div className="flex items-center gap-2.5 px-5 py-5">
            <Bar className="h-8 w-8 rounded-lg" />
            <span>
              <Bar className="h-[14px] w-16" />
              <Bar className="mt-1 h-[11px] w-10" />
            </span>
          </div>
          {/* Keyed by position, not by the width class: the widths repeat, and
              two children keyed "w-20" is a React error. These are fixed
              decorative shapes that never reorder, so the index is the honest
              identity here. */}
          <div className="space-y-1 px-3">
            {["w-16", "w-24", "w-20", "w-28", "w-20", "w-32", "w-24"].map((w, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <Bar className="h-[17px] w-[17px] rounded" />
                <Bar className={`h-[13px] ${w}`} />
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-5 pb-16 pt-6 sm:px-8">
          <Bar className="h-8 w-44" />
          <Bar className="mt-2 h-[13px] w-56" />

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
        </main>
      </div>
    </div>
  );
}
