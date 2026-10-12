// Instant skeleton shown while the product detail page's server component
// fetches from the DB. App Router renders this the moment a product is clicked,
// so the page never feels like it "hangs" on a blank screen. Laid out as the
// page is (ProductDetailView: the gallery, the product and its details, the
// quote box), so nothing jumps when the page arrives.
export default function LoadingProduct() {
  return (
    <main className="min-h-screen bg-slate-50 pt-24 pb-16">
      <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <div className="mb-5 h-3.5 w-56 animate-pulse rounded bg-slate-200" />

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-10 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)] xl:gap-8 2xl:gap-10">
          {/* Gallery */}
          <div className="flex flex-col gap-3 lg:row-span-2 xl:row-span-1 2xl:flex-row-reverse 2xl:items-start">
            <div className="aspect-square w-full animate-pulse rounded-2xl bg-slate-200 2xl:flex-1" />
            <div className="flex gap-2.5 2xl:flex-col">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-slate-200" />
              ))}
            </div>
          </div>

          {/* The product and its details */}
          <div className="flex flex-col">
            <div className="h-7 w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-7 w-3/4 animate-pulse rounded bg-slate-200" />
            <div className="mt-6 h-4 w-32 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-72 animate-pulse rounded-2xl bg-slate-200" />
          </div>

          {/* The quote box */}
          <div className="lg:col-start-2 xl:col-start-3 xl:row-start-1">
            <div className="h-56 animate-pulse rounded-2xl bg-slate-200" />
          </div>
        </div>

        {/* Similar products */}
        <div className="mt-14">
          <div className="mb-5 h-6 w-40 animate-pulse rounded bg-slate-200" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl bg-slate-200" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
