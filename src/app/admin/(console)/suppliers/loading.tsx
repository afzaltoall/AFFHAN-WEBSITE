import { Bar, CardSkeleton, StatRowSkeleton } from "@/components/admin/AdminSkeleton";

/** Shown the instant "Suppliers" is clicked, while Neon is read. */
export default function SuppliersLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-[#f5f5f7]" aria-busy="true">
      <span className="sr-only" role="status">
        Loading suppliers…
      </span>

      {/* Top bar, matching the real one so nothing jumps when it arrives. */}
      <div className="border-b border-black/[0.06] bg-white/80">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6">
          <Bar className="h-9 w-28 rounded-xl" />
          <Bar className="h-8 w-8 rounded-lg" />
          <span>
            <Bar className="h-[15px] w-24" />
            <Bar className="mt-1 h-[11px] w-20" />
          </span>
          <Bar className="ml-auto h-9 w-20 rounded-xl" />
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <div className="mb-5">
          <StatRowSkeleton />
        </div>

        {/* Search and filters */}
        <CardSkeleton className="p-3.5">
          <Bar className="h-12 w-full rounded-xl" />
          {/* Widths are written out rather than computed: Tailwind only ships
              the classes it can see in the source, so a template width would
              arrive with no rule behind it. */}
          <div className="mt-3 flex flex-wrap gap-2">
            {["w-16", "w-32", "w-28", "w-24", "w-36"].map((w, i) => (
              <Bar key={i} className={`h-[30px] rounded-full ${w}`} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Bar className="h-9 w-40 rounded-xl" />
            <Bar className="h-9 w-32 rounded-xl" />
            <Bar className="ml-auto h-9 w-28 rounded-xl" />
          </div>
        </CardSkeleton>

        <Bar className="my-3 h-[13px] w-40" />

        {/* Rows. Eight is about a screenful, so the page settles rather than
            collapsing when the real list replaces it. */}
        <CardSkeleton className="overflow-hidden">
          <div className="border-b border-black/[0.06] bg-black/[0.02] px-4 py-3">
            <Bar className="h-[11px] w-24" />
          </div>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-start gap-4 border-b border-black/[0.06] px-4 py-4 last:border-0">
              <Bar className="mt-0.5 h-4 w-4" />
              <Bar className="mt-0.5 h-[13px] w-6" />
              <span className="w-[19%] min-w-0">
                <Bar className="h-[13px] w-4/5" />
                <Bar className="mt-1.5 h-[11px] w-2/5" />
              </span>
              <Bar className="mt-0.5 h-[13px] w-[14%]" />
              <span className="w-[22%] min-w-0">
                <Bar className="h-[13px] w-3/5" />
              </span>
              <span className="min-w-0 flex-1">
                <Bar className="h-[12px] w-full" />
                <Bar className="mt-1.5 h-[12px] w-3/4" />
              </span>
            </div>
          ))}
        </CardSkeleton>
      </div>
    </div>
  );
}
