"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronRight } from "lucide-react";
import { Picture } from "@/components/ui/SizedPicture";
import type { SpotlightProduct } from "@/lib/homeGrid";

/** The quote form, loaded the first time someone asks for a quote. */
export const InquiryModal = dynamic(() => import("@/components/ui/InquiryModal").then((m) => m.InquiryModal), { ssr: false });

/** The quote form's product, from a homepage tile's. */
export const asInquiry = (p: SpotlightProduct) => ({ id: p.id, name: p.name, imageUrl: p.image, images: [p.image], categoryRef: { name: p.category } });

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50";
/** Where Amazon's strip says "Bestsellers", the category: the one label here that is always true. */
const STRIP = "absolute bottom-2 left-0 max-w-[88%] truncate rounded-r-sm bg-[linear-gradient(90deg,#f2d98a,#fbeec4)] py-0.5 pl-2 pr-2.5 text-[11.5px] font-semibold text-slate-900";
/** The widths a product's picture is offered at (SizedPicture): 440 is the one the spotlight always fetched, already made at the edge. */
export const PRODUCT_WIDTHS = [240, 320, 440] as const;

/**
 * A product as the homepage's rows of products show it: its picture on a
 * ground its white melts into (multiply), so shots from many suppliers read
 * as one set; its name in two lines, room kept for two so the row stays
 * level; and the way to a quote where a shop would print a price. `strip`
 * puts a label on the picture (the spotlight's category). Nothing here shows a
 * price.
 */
export function ProductQuoteTile({
  p,
  near,
  sizes,
  onQuote,
  strip,
}: {
  p: SpotlightProduct;
  near: boolean;
  sizes: string;
  onQuote: (p: SpotlightProduct) => void;
  strip?: string | null;
}) {
  return (
    <div className="group flex h-full flex-col">
      <Link href={`/products/${p.id}/`} className={`block rounded-md ${FOCUS}`}>
        <span className="relative isolate block aspect-square overflow-hidden rounded-md bg-[#f1f4f5]">
          <Picture
            url={p.image}
            widths={PRODUCT_WIDTHS}
            sizes={sizes}
            near={near}
            className="object-contain p-[6%] mix-blend-multiply transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.04]"
          />
          {strip && <span className={STRIP}>{strip}</span>}
        </span>
        <span className="mt-2 line-clamp-2 min-h-[2lh] text-[13px] leading-snug text-slate-800 transition-colors group-hover:text-brand-dark sm:text-[13.5px]">{p.name}</span>
      </Link>
      <button
        type="button"
        onClick={() => onQuote(p)}
        aria-label={`Get a quote for ${p.name}`}
        className={`mt-1.5 inline-flex w-fit items-center gap-0.5 rounded-sm text-[13.5px] font-bold text-brand-dark hover:underline sm:text-[14px] ${FOCUS}`}
      >
        Get a quote
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
