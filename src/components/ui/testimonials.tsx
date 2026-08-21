import Image from "next/image";
import { cn } from "@/lib/utils";

export type Testimonial = {
  /** The customer's own words. Use them verbatim; do not tidy or invent. */
  quote: string;
  name: string;
  /** e.g. "Procurement Manager" */
  role?: string;
  /** e.g. "Gulf Interiors LLC" */
  company?: string;
  /** Local path under /public. Omit and the initials are used instead — which
   *  is the normal case, since most B2B buyers will not supply a photograph. */
  imageSrc?: string;
  /** One entry may take the large cell. */
  featured?: boolean;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function Attribution({ t }: { t: Testimonial }) {
  return (
    <div className="flex items-center gap-3">
      {t.imageSrc ? (
        <div className="relative size-11 shrink-0 overflow-hidden rounded-full bg-slate-100">
          <Image
            src={t.imageSrc}
            alt={`${t.name}, ${t.company ?? "client"}`}
            fill
            sizes="44px"
            className="object-cover"
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#e6f4f8] text-sm font-semibold text-[#176579]"
        >
          {initials(t.name)}
        </div>
      )}
      <div className="min-w-0">
        <cite className="block text-sm font-semibold not-italic text-slate-900">{t.name}</cite>
        <span className="block text-[13px] leading-snug text-slate-500">
          {[t.role, t.company].filter(Boolean).join(", ")}
        </span>
      </div>
    </div>
  );
}

/**
 * Customer quotes in a bento grid — one featured cell, the rest in a row.
 *
 * Deliberately data-driven and empty by default. The section renders nothing
 * until real quotes are passed in, because the only thing worse than no
 * testimonials is invented ones: fabricated endorsements on a commercial page
 * mislead buyers, misuse the names of whoever they are attributed to, and are a
 * Google spam-policy problem on a page being tuned for search.
 *
 * No Review or AggregateRating structured data is emitted, and none should be
 * added here. The same markup was removed from this site's schema earlier for
 * the same reason: a business republishing third-party review data as its own
 * first-party structured data is outside Google's review-snippet guidance.
 * Quoting a customer in visible text is fine; asserting it as review markup is
 * not.
 *
 * Uses the site's own slate/teal tokens rather than shadcn's `bg-card` and
 * `text-muted-foreground`, which are not defined in this project's Tailwind
 * theme and would render unstyled. Avatars are plain markup rather than
 * @radix-ui/react-avatar, so this adds no dependency.
 */
export function Testimonials({
  heading,
  intro,
  testimonials,
  className,
}: {
  heading: string;
  intro?: string;
  testimonials: Testimonial[];
  className?: string;
}) {
  if (testimonials.length === 0) return null;

  const featured = testimonials.find((t) => t.featured) ?? testimonials[0];
  const rest = testimonials.filter((t) => t !== featured);

  return (
    <section className={cn("py-10 lg:py-12 bg-white border-t border-slate-200", className)}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-6 lg:mb-8">
          <h2 className="text-[1.75rem] sm:text-3xl lg:text-4xl font-semibold tracking-[-0.018em] leading-[1.12] text-balance text-slate-900 mb-3">
            {heading}
          </h2>
          {intro ? (
            <p className="text-slate-600 text-sm sm:text-[15px] leading-[1.6] tracking-[-0.003em] text-pretty">
              {intro}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 lg:gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <figure className="rounded-3xl border border-slate-200/60 bg-slate-50 p-6 shadow-sm sm:col-span-2 lg:row-span-2 flex flex-col">
            <blockquote className="text-slate-700 text-base sm:text-lg leading-[1.6] tracking-[-0.003em] text-pretty">
              {featured.quote}
            </blockquote>
            <figcaption className="mt-auto pt-6">
              <Attribution t={featured} />
            </figcaption>
          </figure>

          {rest.map((t) => (
            <figure
              key={t.name + t.quote.slice(0, 24)}
              className="rounded-3xl border border-slate-200/60 bg-slate-50 p-5 shadow-sm flex flex-col"
            >
              <blockquote className="text-slate-600 text-sm leading-[1.6] tracking-[-0.003em] text-pretty">
                {t.quote}
              </blockquote>
              <figcaption className="mt-auto pt-5">
                <Attribution t={t} />
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
