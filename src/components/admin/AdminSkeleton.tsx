/**
 * Placeholder shapes for the admin routes' `loading.tsx` files.
 *
 * Every admin page is `force-dynamic` and reads Neon on each request, and the
 * database sits in us-east-1 while the people using this are in Chennai. A warm
 * request costs about a second; a cold one, after Neon's free tier has
 * suspended the compute, costs three. Without a loading boundary the App Router
 * simply leaves you on the page you came from for that whole time, so clicking
 * "Suppliers" appeared to do nothing at all.
 *
 * These skeletons are what the router shows instead, immediately. They also
 * make the link prefetch useful: with a loading boundary present, hovering a
 * link fetches this much ahead of time, so the transition starts painted.
 *
 * Server components on purpose — no hooks, no client bundle. They render in the
 * light theme because that is what every admin page starts in.
 */

/** One grey block. `animate-pulse` is applied once, by the containing page. */
export function Bar({ className = "" }: { className?: string }) {
  return <span className={`block rounded-md bg-black/[0.07] ${className}`} />;
}

export function CardSkeleton({
  className = "",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return <div className={`rounded-2xl bg-white ring-1 ring-black/[0.04] ${className}`}>{children}</div>;
}

/** The four counters that head the supplier directory. */
export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Bar className="h-[18px] w-[18px] rounded-full" />
          <span className="min-w-0 flex-1">
            <Bar className="h-[19px] w-16" />
            <Bar className="mt-1.5 h-[11px] w-20" />
          </span>
        </CardSkeleton>
      ))}
    </div>
  );
}

/**
 * The console's loading screen, the content only: the rail beside it is already up (the frame's, or on the way to the
 * dashboard the one its loading.tsx draws). Shown by loading.tsx while a page is read, and by AdminFrame from the
 * moment a rail row is pressed (admin-nav.tsx), so both are the same screen and the hand-over between them is
 * invisible. The dashboard's is its figures strip and its two panels; any other page's, a list in a card, which is
 * what nearly all of them are.
 */
export function AdminLoadingScreen({ dashboard }: { dashboard: boolean }) {
  return (
    <div className="min-h-screen bg-[#f5f5f7]" aria-busy="true">
      <span className="sr-only" role="status">
        Loading…
      </span>
      <main className="min-w-0 animate-pulse px-5 pb-16 pt-6 sm:px-8">
        <Bar className="h-8 w-44" />
        <Bar className="mt-2 h-[13px] w-56" />
        {dashboard ? (
          <>
            <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-black/[0.06] ring-1 ring-black/[0.04] sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="block bg-white px-5 py-4">
                  <Bar className="h-[12px] w-20" />
                  <Bar className="mt-2 h-7 w-16" />
                </span>
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
