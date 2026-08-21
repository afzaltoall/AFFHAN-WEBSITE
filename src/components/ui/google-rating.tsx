import { cn } from "@/lib/utils";

/**
 * Plain-text Google rating, laid out as a horizontal credibility band.
 *
 * There is deliberately no Review or AggregateRating JSON-LD here, and none
 * should be added. The same markup was stripped from this site's schema
 * earlier: Google's review-snippet guidance does not allow a business to
 * republish a third party's review data as its own first-party structured
 * data, and unverifiable review markup is a manual-action risk on exactly the
 * pages being tuned for search.
 *
 * Which means this block earns nothing in the rankings — no schema, no rich
 * result, no stars in the SERP. It is here for the person reading the page,
 * not the crawler. Worth remembering before anyone is tempted to "help" it
 * along with markup.
 *
 * `detail` carries whose profile the figure belongs to. Where a page shows a
 * rating earned by a different office that has to be stated, not left for the
 * reader to assume — but stated flatly, as a fact. Explaining or excusing it
 * reads as a business apologising for its own numbers.
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
  detail: string;
  /** Google Business Profile URL, so the claim is checkable. Omit if unknown —
   *  a guessed link is worse than no link. */
  href?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));

  return (
    <section className={cn("py-8 lg:py-10 bg-white border-t border-slate-200", className)}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto rounded-3xl border border-slate-200/70 bg-slate-50 px-6 py-6 sm:px-8 sm:py-7 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8">
            {/* Score. Divider only from sm up, where the two halves sit side
                by side; stacked on a phone it would cut across the layout. */}
            <div className="flex items-center gap-4 sm:shrink-0 sm:border-r sm:border-slate-200 sm:pr-8">
              <span className="text-4xl sm:text-5xl font-bold tracking-[-0.032em] leading-none tabular-nums text-slate-900">
                {rating.toFixed(1)}
              </span>
              <div>
                {/* Two identical star rows, the coloured one clipped to the
                    exact percentage, so 4.8 renders as 4.8 rather than rounding
                    to a half star. aria-hidden — the sentence alongside is the
                    real content, and a screen reader should get the number,
                    not ten stars. */}
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
                <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Google reviews
                </span>
              </div>
            </div>

            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-semibold tracking-[-0.016em] leading-snug text-slate-900 mb-1.5">
                {heading}
              </h2>
              <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.6] tracking-[-0.003em] text-pretty">
                {detail}
              </p>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#176579] hover:text-[#27a8c4] hover:underline transition-colors"
                >
                  See our reviews on Google
                  <span aria-hidden="true">→</span>
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-[18px] sm:size-5 shrink-0">
      <path d="M10 1.5l2.6 5.28 5.83.85-4.22 4.11.997 5.81L10 14.8l-5.21 2.74.996-5.81L1.57 7.63l5.83-.85L10 1.5z" />
    </svg>
  );
}
