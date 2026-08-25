import { Bar, CardSkeleton } from "@/components/admin/AdminSkeleton";

/** Shown while one supplier and their "others for this product" list load. */
export default function SupplierLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-[#f5f5f7]" aria-busy="true">
      <span className="sr-only" role="status">
        Loading supplier…
      </span>

      <div className="border-b border-black/[0.06] bg-white/80">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <Bar className="h-9 w-32 rounded-xl" />
          <Bar className="h-8 w-8 rounded-lg" />
          <Bar className="h-[14px] w-48" />
          <Bar className="ml-auto h-9 w-10 rounded-xl" />
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <CardSkeleton className="p-5 sm:p-6">
          <Bar className="h-7 w-2/3 sm:h-8" />
          <Bar className="mt-2 h-[14px] w-40" />
          <div className="mt-5 grid gap-4 border-t border-black/[0.06] pt-5 sm:grid-cols-3">
            {["w-24", "w-20", "w-28"].map((w, i) => (
              <span key={i}>
                <Bar className={`h-[11px] ${w}`} />
                <Bar className="mt-2 h-[14px] w-32" />
              </span>
            ))}
          </div>
        </CardSkeleton>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <CardSkeleton className="p-5">
            <Bar className="h-[11px] w-16" />
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="mt-3.5 flex items-center gap-2">
                <Bar className="h-[13px] w-[13px] rounded-full" />
                <Bar className="h-[13px] w-40" />
                <Bar className="ml-auto h-7 w-7 rounded-lg" />
              </div>
            ))}
          </CardSkeleton>

          <CardSkeleton className="p-5">
            <Bar className="h-[11px] w-20" />
            <Bar className="mt-3.5 h-[14px] w-4/5" />
            <Bar className="mt-2 h-[14px] w-2/5" />
          </CardSkeleton>

          <CardSkeleton className="p-5 lg:col-span-2">
            <Bar className="h-[11px] w-20" />
            <Bar className="mt-3.5 h-[14px] w-full" />
            <Bar className="mt-2 h-[14px] w-3/4" />
          </CardSkeleton>
        </div>
      </div>
    </div>
  );
}
