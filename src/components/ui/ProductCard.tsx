"use client";

import { useState } from "react";
import Link from "next/link";
import { getCdnUrl } from "@/lib/cdn";
import { FavouriteButton } from "@/components/ui/FavouriteButton";

/**
 * Candidate widths for a product card, measured rather than guessed: the card
 * renders at 178 CSS px on a 412 phone, 225 on a 768 tablet, 206 on a 1440
 * laptop and 235 on a 1920 screen.
 *
 * Capped at 400 on purpose, even though a 2x phone would "want" 412 and a 3x
 * phone 534. A first attempt included 540 and the browser duly chose it on
 * every retina device — sharper, and more bytes than the single fixed 400 this
 * replaced, which is the wrong direction when the whole exercise is LCP. With
 * the cap, every phone and tablet keeps exactly the 400 it already had and
 * only 1x desktops move, down to 260. Nothing can get slower than it was.
 *
 * Kept short for a second reason: each entry is a separate resize for the
 * Serverless Image Handler and a separate CloudFront object, so more
 * candidates mean more cold misses across the audience, not just a better fit.
 */
const PRODUCT_IMAGE_WIDTHS = [200, 260, 340, 400];

/**
 * What the card really occupies, as measured above — not what the grid's
 * column count implies. The old value claimed 50vw on a phone (206 px at 412)
 * when the card is 178, and 20vw on a laptop (288) when it is 206. Overstating
 * here makes the browser pick a larger candidate than it needs. The last entry
 * is in px because the grid container stops growing at 1600.
 */
const PRODUCT_IMAGE_SIZES =
  "(max-width: 767px) 44vw, (max-width: 1023px) 30vw, (max-width: 1600px) 15vw, 240px";

export interface ProductCardData {
  id: number | string;
  name: string;
  imageUrl?: string | null;
  category?: string | null;
  categoryRef?: { name: string | null } | null;
}

interface ProductCardProps {
  product: ProductCardData;
  onClick: () => void;
  priority?: boolean;
}

// Shared product card used by every product grid (homepage desktop/mobile
// grids, catalog page). Do not add a `title=` attribute to the name — that
// triggers a native browser tooltip, which was one of the recurring bugs
// this component was created to stop reintroducing per-page.
//
// Two click targets, deliberately: the image + title LINK to the product detail
// page (/products/[id]) — shareable + crawlable — while "Inquire Now" opens the
// quick quote modal (onClick) without leaving the page. The whole card shares
// one `group` so the hover visuals fire from anywhere on it.
export function ProductCard({ product, onClick, priority }: ProductCardProps) {
  const categoryLabel = product.categoryRef?.name || product.category || "Product";
  // CJ's hotlinked CDN images occasionally go dead — next/image renders
  // nothing visible when a remote image 404s/errors, which looked like a
  // blank, borderless hole in the grid. Track load failure and fall back
  // to the same placeholder used for a missing imageUrl.
  const [imageFailed, setImageFailed] = useState(false);
  // Fade the hotlinked CJ image in once it decodes, so late-arriving images
  // ease in over the neutral placeholder instead of popping in abruptly.
  const [imageLoaded, setImageLoaded] = useState(false);
  const showImage = product.imageUrl && !imageFailed;
  const href = `/products/${product.id}`;

  return (
    <div className="liquid-glass-card group relative flex flex-col text-left w-full overflow-hidden">
      {/* Outside the Link on purpose. A <button> inside an <a> is invalid
          HTML, and the two would fight over the same click. Positioned over
          the image instead, which is where a save control is looked for. */}
      <FavouriteButton
        productId={Number(product.id)}
        size="sm"
        className="absolute right-2.5 top-2.5 z-20"
      />

      <Link href={href} aria-label={product.name} className="flex flex-1 flex-col text-left w-full">
        {/* Fixed image height so cards stay a consistent height regardless of
            how many grid columns fit. */}
        <div className="relative w-full h-40 sm:h-48 shrink-0 bg-slate-50/40 overflow-hidden">
          {showImage ? (
            /* A plain <img>, not next/image, so this can carry a srcSet.
               next/image assigns srcSet itself after spreading the caller's
               props, and with images.unoptimized it assigns undefined — so a
               srcSet passed in is silently dropped. Everything else it was
               giving this element (lazy loading, async decoding, the intrinsic
               size that reserves the box) is spelled out below.

               Why it needs one: every card asked for 400px regardless of how
               big it actually renders. Measured across viewports, the card is
               206 CSS px on a 1440 laptop and 178 on a phone, so a 1x laptop
               was downloading 45 kB where 20 kB would do — while a 3x phone,
               which genuinely wants 534px, was getting an upscaled 400. One
               fixed width cannot serve both; the browser picks correctly from
               a srcSet using the same `sizes` the old element already had. */
            /* no-img-element is disabled below because it has the tradeoff
               backwards here: it assumes next/image would optimise this, and
               it cannot — images.unoptimized is on deliberately, so next/image
               emits no srcSet at all. This element lowers bandwidth rather
               than raising it. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getCdnUrl(product.imageUrl, 400) as string}
              srcSet={PRODUCT_IMAGE_WIDTHS
                .map((w) => `${getCdnUrl(product.imageUrl, w)} ${w}w`)
                .join(", ")}
              sizes={PRODUCT_IMAGE_SIZES}
              alt={product.name}
              width={400}
              height={400}
              loading={priority ? "eager" : "lazy"}
              // The one priority card is the LCP candidate on most screens.
              fetchPriority={priority ? "high" : undefined}
              decoding="async"
              className={`absolute inset-0 w-full h-full object-cover group-hover:scale-[1.07] transition-all duration-500 ease-out ${priority || imageLoaded ? "opacity-100 scale-100" : "opacity-0 scale-105"}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm">No Image</div>
          )}
          {/* Category chip floating on the image */}
          <span className="absolute top-2.5 left-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-700 bg-white/85 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-sm max-w-[85%] truncate">
            {categoryLabel}
          </span>
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>

        <div className="px-3 pt-3 sm:px-4 sm:pt-4 w-full">
          <div className="h-[40px] sm:h-[44px] w-full">
            <h3 className="text-[13.5px] sm:text-sm font-bold text-[#081f2a] leading-snug line-clamp-2 tracking-[-0.01em] group-hover:text-[#176579] transition-colors">
              {product.name}
            </h3>
          </div>
        </div>
      </Link>

      <div className="px-3 pb-3 sm:px-4 sm:pb-4 pt-2.5 sm:pt-3 mt-auto">
        <button
          onClick={onClick}
          className="relative overflow-hidden flex items-center justify-center gap-1.5 text-[11px] sm:text-[12px] font-bold text-[#176579] bg-white/70 backdrop-blur-sm border border-white/80 shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-3 py-2 sm:py-2.5 rounded-xl group-hover:border-[#27a8c4] group-hover:text-white group-hover:shadow-[0_8px_16px_rgba(39,168,196,0.25)] transition-all duration-300 w-full cursor-pointer"
        >
          <span className="absolute inset-0 bg-[#27a8c4] -translate-x-full group-hover:translate-x-0 transition-transform duration-400 ease-out z-0"></span>
          <span className="relative z-10 flex items-center gap-1.5">
            Inquire Now
            <svg className="w-3.5 h-3.5 opacity-80 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
          </span>
        </button>
      </div>
    </div>
  );
}
