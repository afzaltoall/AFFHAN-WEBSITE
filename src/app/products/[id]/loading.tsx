// Instant skeleton shown while the product detail page's server component
// fetches from the DB. App Router renders this the moment a product is clicked,
// so the page never feels like it "hangs" on a blank screen.
export default function LoadingProduct() {
  return (
    <main className="min-h-screen bg-slate-50 pt-24 pb-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <div className="mb-5 h-3.5 w-56 animate-pulse rounded bg-slate-200" />

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Gallery */}
          <div>
            <div className="aspect-square w-full animate-pulse rounded-2xl bg-slate-200" />
            <div className="mt-3 flex gap-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 w-16 animate-pulse rounded-xl bg-slate-200" />
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-col">
            <div className="mb-3 h-6 w-32 animate-pulse rounded-full bg-slate-200" />
            <div className="h-7 w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-7 w-3/4 animate-pulse rounded bg-slate-200" />
            <div className="mt-4 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
            </div>
            <div className="mt-5 h-14 w-full animate-pulse rounded-xl bg-slate-200" />
            <div className="mt-5 h-12 w-full animate-pulse rounded-xl bg-slate-200 sm:w-48" />
            <div className="mt-6 flex gap-4 border-t border-slate-200 pt-5">
              <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
            </div>
          </div>
        </div>

        {/* Similar products */}
        <div className="mt-14">
          <div className="mb-5 h-6 w-40 animate-pulse rounded bg-slate-200" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl bg-slate-200" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
