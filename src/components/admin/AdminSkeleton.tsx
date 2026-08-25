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
