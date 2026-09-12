"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";

interface Cat {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  productCount: number;
}

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
      <div className="p-3">
        <h3 className="text-[13px] font-bold text-slate-800 leading-snug line-clamp-2 group-hover:text-brand-dark transition-colors min-h-[34px]">
          {cat.name}
        </h3>
        <p className="text-[11px] font-semibold text-slate-400 mt-1">
          {cat.productCount.toLocaleString("en-US")} products
        </p>
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
  const [categories, setCategories] = useState<Cat[]>(initialCategories || []);
  const total = totalCount ?? categories.length;

  // Initial categories are fetched server-side; we no longer fetch on mount.

  return (
    <section id="product-categories" className="w-full bg-white py-14 sm:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Product Categories</span>
            <h2 className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-slate-900">
              Explore our sourcing categories
            </h2>
            <p className="mt-2 text-slate-500 max-w-2xl">
              Browse across {total.toLocaleString()} verified categories — every product we can source for you. Whether you&rsquo;re working with our <Link href="/sourcing-company-chennai/" className="text-brand hover:underline font-medium">sourcing company in Chennai</Link> or our <Link href="/sourcing-company-dubai/" className="text-brand hover:underline font-medium">sourcing company in Dubai</Link>, we handle end-to-end procurement, quality checks, and freight.
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
