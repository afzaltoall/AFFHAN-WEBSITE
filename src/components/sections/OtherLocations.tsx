import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Cross-links between the location pages.
 *
 * Built because the newer pages were orphaned: UK, Singapore, Malaysia and
 * Guangzhou linked to no other location page anywhere in their body content,
 * so each sat on its own with nothing passing between them. Footer links do
 * not close that — sitewide boilerplate is discounted, and these pages need to
 * pass authority to each other specifically.
 *
 * Deliberately terse. This is navigation rather than content, so it carries
 * descriptive anchor text and almost no prose: every extra sentence here is a
 * sentence repeated on seven pages, which works against the differentiation
 * the pages exist to have.
 */
const LOCATIONS = [
  { slug: "sourcing-company-chennai", label: "Chennai", anchor: "Sourcing agent in Chennai" },
  { slug: "sourcing-company-dubai", label: "Dubai", anchor: "Sourcing company in Dubai" },
  { slug: "sourcing-company-uk", label: "UK", anchor: "China sourcing agent in the UK" },
  { slug: "sourcing-company-singapore", label: "Singapore", anchor: "Sourcing agent in Singapore" },
  { slug: "sourcing-company-malaysia", label: "Malaysia", anchor: "Sourcing agent in Malaysia" },
  { slug: "china-sourcing-office-guangzhou", label: "Guangzhou", anchor: "Our Guangzhou sourcing office" },
  { slug: "sourcing-from-china", label: "China", anchor: "Sourcing from China: a buyer's guide" },
];

export function OtherLocations({
  current,
  className,
}: {
  /** Slug of the page this renders on, so it is not linked to itself. */
  current: string;
  className?: string;
}) {
  const others = LOCATIONS.filter((l) => l.slug !== current);

  return (
    <section className={cn("py-10 lg:py-12 bg-slate-50 border-t border-slate-200", className)}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-base sm:text-lg font-semibold tracking-[-0.016em] text-slate-900 mb-4">
          AFFHAN sourcing offices worldwide
        </h2>
        <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((l) => (
            <li key={l.slug}>
              <Link
                href={`/${l.slug}/`}
                className="group inline-flex items-baseline gap-2 text-[15px] text-slate-600 hover:text-[#176579] transition-colors"
              >
                <span className="font-semibold text-slate-900 group-hover:text-[#176579]">{l.label}</span>
                <span className="text-slate-500 group-hover:text-[#27a8c4]">— {l.anchor}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
