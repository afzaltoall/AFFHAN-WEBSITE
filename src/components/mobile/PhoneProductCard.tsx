"use client";

import { useState } from "react";
import { Loader } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import type { ProductCardData } from "@/components/ui/ProductCard";

/** ProductCard's widths, so the same resized copies are reused. */
const WIDTHS = [200, 260, 340, 400];

/**
 * A product on a phone's grid, as Alibaba draws one: the picture, square, on a light grey tile with soft
 * corners; under it the name, two lines. No price (AFFHAN quotes): a tap opens the product's quote in place.
 * The picture is multiplied into the tile, so a product shot on white (most of the catalogue) still sits on
 * the grey square rather than vanishing into the page. `sizes`: what the card occupies, a third of the screen
 * beside the categories rail (133 CSS px on a 411 phone), half of it on a category's own page.
 */
export function PhoneProductCard({ product, sizes, onClick }: { product: ProductCardData; sizes: string; onClick: () => void }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : getCdnUrl(product.imageUrl, 260);
  return (
    <button type="button" onClick={onClick} aria-label={`${product.name}: request a quote`} className="group block w-full text-left">
      <span className="block aspect-square overflow-hidden rounded-lg bg-[#f5f5f5]">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            srcSet={WIDTHS.map((w) => `${getCdnUrl(product.imageUrl, w)} ${w}w`).join(", ")}
            sizes={sizes}
            alt=""
            width={260}
            height={260}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover mix-blend-multiply transition-transform duration-200 group-active:scale-[0.97]"
          />
        )}
      </span>
      <span className="mt-2 line-clamp-2 min-h-[2.6em] text-[13px] font-medium leading-[1.3] text-slate-800">{product.name}</span>
    </button>
  );
}

/** A card's shape while the first products are on their way. */
export function PhoneProductCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-square rounded-lg bg-[#f5f5f5]" />
      <div className="mt-2 flex min-h-[2.6em] flex-col justify-center gap-1.5 text-[13px] leading-[1.3]">
        <div className="h-2.5 w-11/12 rounded-full bg-slate-100" />
        <div className="h-2.5 w-2/3 rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

/** Alibaba's "Loading" under a grid while its next products are on their way (the owner, 2026-10-14). */
export function PhoneGridLoading() {
  return (
    <p role="status" className="flex items-center justify-center gap-2 py-5 text-[14px] text-slate-500">
      Loading
      <Loader size={18} strokeWidth={2} className="animate-spin text-slate-500 motion-reduce:animate-none" aria-hidden />
    </p>
  );
}
