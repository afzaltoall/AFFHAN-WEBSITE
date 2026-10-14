"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ChevronRight } from "lucide-react";
import type { ProductCardData } from "@/components/ui/ProductCard";
import { usePhoneFeed } from "@/components/mobile/usePhoneFeed";
import { CategoryLink } from "@/components/mobile/categoryNav";
import { setPhoneSearchContext } from "@/components/mobile/phoneSearchContext";
import { PhoneGridLoading, PhoneProductCard, PhoneProductCardSkeleton } from "@/components/mobile/PhoneProductCard";

/** A category's own page goes this far, 40 a page: 1,000 products. */
const PAGES = 25;

/**
 * A category's page on a phone, below 768px, as Alibaba's (the owner, 2026-10-14, of Alibaba's Golf Carts and
 * Laptops pages: "see how it works, how it shows"): the frame's search box says the category's name, as
 * Alibaba's says "laptops"; the trail up to it on one line, each step shortened rather than the line scrolled;
 * its name and how many products it holds; then straight to its products, two across, filling the screen's
 * width, more of them arriving as the end comes near, with Alibaba's "Loading" under them meanwhile. A product
 * opens its quote in place; a crumb opens its category in place too (CategoryLink). At the end, an offer to
 * source what is not listed: AFFHAN's catalogue is what it sources, not all of it. The circles are the
 * categories screen's (PhoneCategoryBrowser).
 *
 * From 768px up, and for a search, the catalogue is as it was.
 */
export function PhoneCategoryPage({
  id,
  name,
  count,
  path,
  onInquire,
}: {
  id: string;
  name: string;
  /** Products in it and everything under it. */
  count: number;
  /** Its real ancestry, the top first, itself last. */
  path: { id: string; name: string }[];
  onInquire: (p: ProductCardData) => void;
}) {
  const { products, loading, done, sentinel } = usePhoneFeed(id, undefined, PAGES);

  // The page's title as the server gives a category's (products/page.tsx), since it was opened in place; and
  // the frame's search box says what is being looked at.
  useEffect(() => {
    const before = document.title;
    document.title = `${name} — Wholesale Suppliers & Bulk Sourcing | AFFHAN`;
    setPhoneSearchContext(name);
    return () => {
      document.title = before;
      setPhoneSearchContext(null);
    };
  }, [name]);

  const ancestors = path.slice(0, -1);
  return (
    <div className="min-h-[calc(100dvh-var(--nav-h)-var(--phone-bottom,3.5rem))] bg-white pb-6 md:hidden">
      <nav aria-label="Breadcrumb" className="px-3 pt-3">
        <ol className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[12.5px] text-slate-500">
          <li className="shrink-0">
            <Link href="/" className="active:text-slate-800">
              AFFHAN
            </Link>
          </li>
          {ancestors.map((a) => (
            <li key={a.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight size={13} className="shrink-0 text-slate-400" aria-hidden />
              <CategoryLink id={a.id} className="truncate active:text-slate-800">
                {a.name}
              </CategoryLink>
            </li>
          ))}
          <li className="flex min-w-0 max-w-[50%] shrink-0 items-center gap-1">
            <ChevronRight size={13} className="shrink-0 text-slate-400" aria-hidden />
            <span aria-current="page" className="truncate text-slate-700">
              {name}
            </span>
          </li>
        </ol>
      </nav>

      <h1 className="px-3 pt-1.5 text-[20px] font-bold leading-tight text-slate-900 [text-wrap:balance]">
        {name} <span className="whitespace-nowrap text-[14px] font-semibold text-slate-500">({count.toLocaleString("en-US")})</span>
      </h1>

      <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 px-3">
        {products.map((p) => (
          <li key={String(p.id)} className="min-w-0">
            <PhoneProductCard product={p} sizes="(max-width: 767px) 48vw, 260px" onClick={() => onInquire(p)} />
          </li>
        ))}
        {!products.length &&
          !done &&
          [...Array(6)].map((_, i) => (
            <li key={`wait-${i}`} aria-hidden className="min-w-0">
              <PhoneProductCardSkeleton />
            </li>
          ))}
      </ul>
      {loading && products.length > 0 && <PhoneGridLoading />}
      {!done && <div ref={sentinel} aria-hidden className="h-px" />}

      {done && (
        <div className="mx-3 mt-6 rounded-xl bg-slate-50 px-4 py-5 text-center">
          <p className="text-[14px] font-semibold text-slate-800">{products.length ? "Not what you need?" : "Nothing listed here yet"}</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] text-slate-500">Our catalogue shows what we source, not all of it. Tell us what you need and our team in China will find it.</p>
          <Link
            href={`/contact/?message=${encodeURIComponent(`I'm looking for: ${name}`)}`}
            className="mt-3 inline-flex rounded-full bg-brand-dark px-5 py-2 text-[13px] font-bold text-white active:bg-brand-deep"
          >
            Request this product
          </Link>
        </div>
      )}
    </div>
  );
}
