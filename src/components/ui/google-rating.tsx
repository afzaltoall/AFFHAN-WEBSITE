import { cn } from "@/lib/utils";

/**
 * Plain-text Google rating with a visual star bar.
 *
 * There is deliberately no Review or AggregateRating JSON-LD here, and none
 * should be added. The same markup was stripped from this site's schema
 * earlier: Google's review-snippet guidance does not allow a business to
 * republish a third party's review data as its own first-party structured
 * data. Stating the rating as visible text is fine; asserting it as schema is
 * not — and unverifiable review markup is a manual-action risk on exactly the
 * pages being tuned for search.
 *
 * `attribution` exists because these figures belong to a specific Google
 * Business Profile. Where a page shows a rating earned by a different office,
 * that has to be said on the page rather than left for the reader to assume.
 */
export function GoogleRating({
  heading,
  rating,
  detail,
  href,
  className,
}: {
  heading: string;
  /** The real figure. Never round up. */
  rating: number;
  /** The sentence under the stars, carrying the count and whose profile it is. */
  detail: string;
  /** Google Business Profile URL, so the claim is checkable. Omit if unknown —
   *  a guessed link is worse than no link. */
  href?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));

  return (
    <section className={cn("py-10 lg:py-12 bg-white border-t border-slate-200", className)}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto rounded-3xl border border-slate-200/60 bg-slate-50 px-6 py-8 sm:px-10 text-center shadow-sm">
          <h2 className="text-[1.5rem] sm:text-2xl lg:text-3xl font-semibold tracking-[-0.018em] leading-[1.15] text-balance text-slate-900 mb-4">
            {heading}
          </h2>

          {/* Two identical star rows, the coloured one clipped to the exact
              percentage, so 4.8 renders as 4.8 rather than being rounded to a
              half star. aria-hidden because the sentence below is the real
              content — a screen reader gets the number, not ten stars. */}
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className="text-3xl sm:text-4xl font-bold tracking-[-0.032em] tabular-nums text-slate-900">
              {rating.toFixed(1)}
            </span>
            <span className="relative inline-block leading-none" aria-hidden="true">
              <span className="flex text-slate-300">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} />
                ))}
              </span>
              <span
                className="absolute inset-0 flex overflow-hidden text-[#f0a500]"
                style={{ width: `${pct}%` }}
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} />
                ))}
              </span>
            </span>
          </div>

          <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.65] tracking-[-0.003em] text-pretty">
            {detail}
          </p>

          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#176579] hover:text-[#27a8c4] hover:underline transition-colors"
            >
              See our reviews on Google
              <span aria-hidden="true">→</span>
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-6 sm:size-7 shrink-0">
      <path d="M10 1.5l2.6 5.28 5.83.85-4.22 4.11.997 5.81L10 14.8l-5.21 2.74.996-5.81L1.57 7.63l5.83-.85L10 1.5z" />
    </svg>
  );
}
