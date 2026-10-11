// Instant skeleton shown while the product detail page's server component
// fetches from the DB. App Router renders this the moment a product is clicked,
// so the page never feels like it "hangs" on a blank screen. Laid out as the
// page is (ProductDetailView: the gallery, the product, the quote box), so
// nothing jumps when the page arrives.
export default function LoadingProduct() {
  return (
    <main className="min-h-screen bg-slate-50 pt-24 pb-16">
      <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <div className="mb-5 h-3.5 w-56 animate-pulse rounded bg-slate-200" />

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-10 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)] xl:gap-8 2xl:gap-10">
          {/* Gallery */}
          <div className="flex flex-col gap-3 lg:row-span-2 lg:flex-row-reverse lg:items-start xl:row-span-1">
            <div className="aspect-square w-full animate-pulse rounded-2xl bg-slate-200 lg:flex-1" />
            <div className="flex gap-2.5 lg:flex-col">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-slate-200" />
              ))}
            </div>
          </div>

          {/* The product */}
          <div className="flex flex-col">
            <div className="mb-3 h-6 w-32 animate-pulse rounded-full bg-slate-200" />
            <div className="h-7 w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-7 w-3/4 animate-pulse rounded bg-slate-200" />
            <div className="mt-4 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
            </div>
            <div className="mt-6 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-200" />
              ))}
            </div>
          </div>

          {/* The quote box */}
          <div className="lg:col-start-2 xl:col-start-3 xl:row-start-1">
            <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
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
