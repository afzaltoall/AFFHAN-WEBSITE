"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useNear } from "@/components/ui/SizedPicture";
import { InquiryModal, ProductQuoteTile, asInquiry } from "@/components/ui/ProductQuoteTile";
import type { ProductRail, SpotlightProduct } from "@/lib/homeGrid";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50";
/** Eight across from 1536px, six on a laptop, and a row to swipe below that: what each tile's picture is drawn at. */
const SIZES = "(min-width: 1920px) 216px, (min-width: 1536px) calc(12.5vw - 24px), (min-width: 1024px) calc(16.7vw - 27px), (min-width: 768px) 21vw, (min-width: 640px) 27vw, 42vw";

/**
 * A family's row of products (lib/homeGrid.ts, getRails): Amazon's and
 * Flipkart's rails, without their prices, a fresh mix every day. Eight in a
 * row on a wide screen, six on a laptop, a row to swipe on a phone or a
 * tablet, edge to edge of its card so the next one shows at the edge.
 */
export function ProductRailSection({ rail }: { rail: ProductRail }) {
  const [quote, setQuote] = useState<SpotlightProduct | null>(null);
  const [ref, near] = useNear<HTMLElement>();
  const id = `rail-${rail.href.split("=").pop()}`;
  return (
    <section ref={ref} aria-labelledby={id} className="liquid-glass-card min-w-0 p-3 sm:p-4 lg:p-5">
      <div className="flex items-end justify-between gap-4 px-0.5">
        <div className="min-w-0">
          <h2 id={id} className="text-[18px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[21px]">
            {rail.title}
          </h2>
          <p className="mt-1 text-[13px] leading-snug text-slate-500 sm:text-[14px]">{`${rail.subtitle} · A fresh mix every day`}</p>
        </div>
        <Link href={rail.href} className={`inline-flex shrink-0 items-center gap-0.5 rounded-sm text-[13px] font-semibold text-brand-dark hover:underline sm:text-sm ${FOCUS}`}>
          See all
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <ul className="-mx-3 mt-3 flex snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:-mx-4 sm:mt-4 sm:scroll-px-4 sm:gap-4 sm:px-4 lg:mx-0 lg:grid lg:grid-cols-6 lg:overflow-visible lg:px-0 lg:pb-0 2xl:grid-cols-8 [&::-webkit-scrollbar]:hidden">
        {rail.products.map((p, i) => (
          <li key={p.id} className={`w-[42%] max-w-[210px] shrink-0 snap-start sm:w-[27%] md:w-[21%] lg:w-auto lg:max-w-none ${i >= 6 ? "lg:max-2xl:hidden" : ""}`}>
            <ProductQuoteTile p={p} near={near} sizes={SIZES} onQuote={setQuote} />
          </li>
        ))}
      </ul>
      {quote && <InquiryModal product={asInquiry(quote)} onClose={() => setQuote(null)} />}
    </section>
  );
}

export default ProductRailSection;
