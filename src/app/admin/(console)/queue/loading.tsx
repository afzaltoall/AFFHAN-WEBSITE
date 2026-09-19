import { Bar, CardSkeleton } from "@/components/admin/AdminSkeleton";

/**
 * Shown while the queue's four queries run.
 *
 * The page is small but it still waits on Neon, and on a suspended free-tier
 * compute that is a couple of seconds of nothing. The console group has had a
 * skeleton since it was built; this route did not, so it flashed blank — the
 * one screen where a blank means "the queue is empty" to anybody reading it.
 *
 * Three tiles and a few rows, in the shape the real page has, so the layout
 * does not jump when the data lands.
 */
export default function QueueLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-[#f5f5f7] px-5 py-8 sm:px-8 lg:px-10" aria-busy="true">
      <span className="sr-only" role="status">
        Loading the queue…
      </span>

      <div className="mb-6">
        <Bar className="h-7 w-32" />
        <Bar className="mt-2 h-4 w-72" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <CardSkeleton key={i}>
            <div className="flex items-center gap-3">
              <Bar className="h-9 w-9 rounded-xl" />
              <div className="flex-1">
                <Bar className="h-6 w-10" />
                <Bar className="mt-2 h-3.5 w-24" />
              </div>
            </div>
            <Bar className="mt-3 h-3 w-40" />
          </CardSkeleton>
        ))}
      </div>

      <div className="mt-6">
        <Bar className="h-4 w-40" />
        <div className="mt-2 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 border-b border-black/[0.06] p-4 last:border-b-0">
              <Bar className="h-11 w-11 rounded-xl" />
              <div className="flex-1">
                <Bar className="h-4 w-48" />
                <Bar className="mt-2 h-3 w-72" />
              </div>
              <Bar className="hidden h-7 w-28 rounded-full sm:block" />
              <Bar className="hidden h-7 w-32 rounded-full sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
