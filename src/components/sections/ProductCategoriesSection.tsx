"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useState } from "react";
import { ArrowRight } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";

interface Cat {
  id: string;
  name: string;
  thumbnailUrl: string | null;
}

/**
 * The near end: the location pages, after the words "Sourcing company in",
 * each place as its page's title has it (the UK page is London's).
 */
const LOCATION_LINKS = [
  { href: "/sourcing-company-chennai/", label: "Chennai" },
  { href: "/sourcing-company-dubai/", label: "Dubai" },
  { href: "/sourcing-company-singapore/", label: "Singapore" },
  { href: "/sourcing-company-malaysia/", label: "Malaysia" },
  { href: "/sourcing-company-uk/", label: "London" },
  { href: "/sourcing-company-france/", label: "France" },
];
/** A link inside a sentence: underlined, as a link in running text should be, so it never rests on colour alone. */
const IN_TEXT =
  "font-semibold text-slate-800 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:text-brand-dark hover:decoration-brand-dark/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-sm";
const PLACE =
  "font-medium text-brand-dark underline decoration-brand/30 underline-offset-[3px] transition-colors hover:decoration-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-sm";

function CategoryTile({ cat }: { cat: Cat }) {
  const [failed, setFailed] = useState(false);
  return (
    <Link
      href={`/products/?categoryId=${cat.id}`}
      className="group flex flex-col liquid-glass-card transition-all overflow-hidden"
    >
      <div className="relative w-full aspect-square bg-slate-50 overflow-hidden">
        {cat.thumbnailUrl && !failed ? (
          <Image
            src={getCdnUrl(cat.thumbnailUrl, 300) as string}
            alt={cat.name}
            fill
            sizes="(max-width:640px) 40vw, (max-width:1024px) 22vw, 15vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">No Image</div>
        )}
      </div>
      {/* Its name alone: a product count under every tile read as clutter (the owner, 2026-10-08). */}
      <div className="p-3">
        <h3 className="text-[13px] font-bold text-slate-800 leading-snug line-clamp-2 group-hover:text-brand-dark transition-colors min-h-[34px]">
          {cat.name}
        </h3>
      </div>
    </Link>
  );
}

/// How many tiles the homepage sends is decided in src/app/page.tsx, not here.
///
/// It briefly lived here and was imported by the page. That does not work: this
/// is a "use client" module, so a server component importing a value out of it
/// receives a client reference rather than the number. `slice(0, reference)`
/// evaluated to `slice(0, 0)`, the grid rendered zero categories, and the
/// section fell through to its loading skeleton — on a build that otherwise
/// looked correct.

/// Capped again, and this time the rest are a page away rather than a click.
///
/// The cap was removed on the argument that content-visibility makes the tiles
/// free: off-screen subtrees stay in the DOM but skip layout and paint. That is
/// true of layout and paint, and it is not true of everything else. Uncapped,
/// the homepage shipped 662 cards, 688 images and 6,144 DOM nodes in 1.45MB of
/// HTML, against 157 images and 716KB with the cap — and GTmetrix stopped being
/// able to score the page at all, failing with "No CPU idle period". The
/// document still has to be parsed, hydrated and kept in memory whether or not
/// the renderer draws it.
///
/// The old version expanded in place, which put all of them back in the DOM on
/// one click and recreated the problem for anyone who pressed it. The button
/// now links to /products/, where the full list already lives behind its own
/// pagination.

export function ProductCategoriesSection({
  initialCategories = [],
  totalCount,
}: {
  /** Already sliced by the page — see the note on HOMEPAGE_CATEGORY_TILES. */
  initialCategories?: Cat[];
  /** How many categories exist in total, for the copy and the button. */
  totalCount?: number;
}) {
  const [categories] = useState<Cat[]>(initialCategories || []);
  const total = totalCount ?? categories.length;

  // Initial categories are fetched server-side; we no longer fetch on mount.

  return (
    <section id="product-categories" className="w-full bg-white py-14 sm:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div className="max-w-3xl">
            {/* A heading the size of the grid's above it, and words a buyer would search for. */}
            <h2 className="text-[19px] font-bold tracking-tight text-slate-900 sm:text-[22px]">Top categories to source from China</h2>
            {/* All nine pages are linked from here, not from the footer alone.

                This block is the homepage's only contextual link into the
                China and location pages: the footer is boilerplate on every URL
                and carries far less weight than a body link. They have been one
                long sentence with nine links in it (clumsy, the owner said on
                2026-10-06), then two rows of pills under spaced capital labels,
                below an eyebrow, a poster-sized heading and a sales paragraph
                (made-by-AI, the owner said on 2026-10-08).

                Now: the three China pages inside three short, factual
                sentences, each link named as its page is titled ("Guangzhou
                Sourcing Agent & China Buying Office", "Sourcing From China:
                Costs, Lead Times & Supplier Risks"), and the six places in one
                plain row after "Sourcing company in", the way a big shop lists
                its country sites. The category count went with the old
                paragraph, whose "verified" was a claim nothing here backs; the
                tiles below carry the counts. */}
            <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
              {"AFFHAN has been a "}
              <Link href="/china-sourcing-company/" className={IN_TEXT}>
                China sourcing company
              </Link>
              {" since 2000, with its own "}
              <Link href="/china-sourcing-office-guangzhou/" className={IN_TEXT}>
                buying office in Guangzhou
              </Link>
              {". We find the supplier, check the goods and ship them to you, customs included. Our "}
              <Link href="/sourcing-from-china/" className={IN_TEXT}>
                sourcing from China guide
              </Link>
              {" covers costs, lead times and supplier risks."}
            </p>
            <p className="mt-2.5 text-[14px] leading-relaxed text-slate-500">
              <span className="font-semibold text-slate-700">Sourcing company in</span>{" "}
              {/* A place keeps its dot; a line may break after the dot, never inside a name. */}
              {LOCATION_LINKS.map((l, i) => (
                <Fragment key={l.href}>
                  <span className="whitespace-nowrap">
                    <Link href={l.href} className={PLACE}>
                      {l.label}
                    </Link>
                    {i < LOCATION_LINKS.length - 1 && (
                      <span aria-hidden="true" className="font-bold text-slate-400">
                        {" ·"}
                      </span>
                    )}
                  </span>
                  {i < LOCATION_LINKS.length - 1 && " "}
                </Fragment>
              ))}
            </p>
          </div>
          <Link
            href="/products/"
            className="inline-flex items-center gap-2 text-sm font-bold text-brand-dark hover:gap-3 transition-all shrink-0"
          >
            View all categories <ArrowRight size={16} />
          </Link>
        </div>

        {categories.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-100 overflow-hidden">
                <div className="aspect-square bg-slate-100 animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-3.5 bg-slate-100 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {categories.map((cat) => (
                <CategoryTile key={cat.id} cat={cat} />
              ))}
            </div>

            {total > categories.length && (
              <div className="mt-8 flex justify-center">
                <Link
                  href="/products/"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-brand-dark shadow-sm transition-all hover:border-brand/50 hover:gap-3"
                >
                  Explore More Categories
                  <ArrowRight size={16} />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
