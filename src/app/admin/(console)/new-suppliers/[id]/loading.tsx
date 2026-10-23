import { Bar, CardSkeleton } from "@/components/admin/AdminSkeleton";

/** Shown while one new supplier and their applications load: the page's own shape, as Old Suppliers' is. */
export default function NewSupplierLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-[#f5f5f7]" aria-busy="true">
      <span className="sr-only" role="status">
        Loading supplier…
      </span>

      <div className="border-b border-black/[0.06] bg-white/80">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <Bar className="h-9 w-32 rounded-xl" />
          <Bar className="h-[14px] w-48" />
          <Bar className="ml-auto h-9 w-10 rounded-xl" />
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-10">
        <CardSkeleton className="p-5 sm:p-6">
          <Bar className="h-7 w-2/3 sm:h-8" />
          <Bar className="mt-2 h-[14px] w-40" />
          <div className="mt-5 grid gap-4 border-t border-black/[0.06] pt-5 sm:grid-cols-2 lg:grid-cols-4">
            {["w-24", "w-20", "w-28", "w-24"].map((w, i) => (
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
        </div>

        <Bar className="mt-7 h-[15px] w-36" />
        <CardSkeleton className="mt-3 p-5 sm:p-6">
          <div className="flex gap-5">
            <Bar className="h-24 w-24 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <Bar className="h-[12px] w-48" />
              <Bar className="mt-2.5 h-[17px] w-4/5" />
              <Bar className="mt-3 h-6 w-40 rounded-full" />
            </div>
          </div>
        </CardSkeleton>
      </div>
    </div>
  );
}
