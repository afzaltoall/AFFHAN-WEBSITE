"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useNear } from "@/components/ui/SizedPicture";
import { InquiryModal, ProductQuoteTile, asInquiry } from "@/components/ui/ProductQuoteTile";
import type { SpotlightProduct } from "@/lib/homeGrid";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50";
/** Two across on a phone, then three, four, six and eight: what each tile's picture is drawn at. */
const SIZES = "(min-width: 1920px) 216px, (min-width: 1536px) calc(12.5vw - 24px), (min-width: 1024px) calc(16.7vw - 27px), (min-width: 768px) calc(25vw - 28px), (min-width: 640px) calc(33vw - 32px), calc(50vw - 30px)";
/** A phone shows half: twelve rows of two were enough before the footer. */
const ON_A_PHONE = 24;

/**
 * "More to explore" (lib/homeGrid.ts, getMore): the homepage's last section,
 * Flipkart's "Suggested for you" without the tracking it is suggested from: a
 * product from a category of each clean family in turn, a new mix every day,
 * and the way on to the whole catalogue. Forty-eight, which fills whole rows
 * at two, three, four, six and eight across. Each picture loads as its own
 * tile comes near, so the end of the grid does not hold up its start.
 */
export function MoreToExploreSection({ products }: { products: SpotlightProduct[] }) {
  const [quote, setQuote] = useState<SpotlightProduct | null>(null);
  if (!products.length) return null;
  return (
    <section aria-labelledby="more-title" className="liquid-glass-card min-w-0 p-3 sm:p-4 lg:p-5">
      <div className="px-0.5">
        <h2 id="more-title" className="text-[18px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[21px]">
          More to explore
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-slate-500 sm:text-[14px]">From across the catalogue, a new mix every day</p>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-5 sm:mt-4 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
        {products.map((p, i) => (
          <Item key={p.id} p={p} phone={i < ON_A_PHONE} onQuote={setQuote} />
        ))}
      </ul>
      <div className="mt-6 flex justify-center sm:mt-8">
        <Link
          href="/products/"
          className={`inline-flex items-center gap-1 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-brand-dark shadow-sm ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-50 ${FOCUS}`}
        >
          Browse the full catalogue
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {quote && <InquiryModal product={asInquiry(quote)} onClose={() => setQuote(null)} />}
    </section>
  );
}

function Item({ p, phone, onQuote }: { p: SpotlightProduct; phone: boolean; onQuote: (p: SpotlightProduct) => void }) {
  const [ref, near] = useNear<HTMLLIElement>();
  return (
    <li ref={ref} className={`min-w-0 ${phone ? "" : "max-sm:hidden"}`}>
      <ProductQuoteTile p={p} near={near} sizes={SIZES} onQuote={onQuote} />
    </li>
  );
}

export default MoreToExploreSection;
