"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
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
 * every retina device — sharper, and MORE bytes than the single fixed 400 this
 * replaces, which is the wrong direction when the point is page weight. With
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
 * for a card that is 178, and 20vw on a laptop (288) for one that is 206;
 * overstating it makes the browser pick a larger candidate than it needs. The
 * last entry is in px because the grid container stops growing at 1600.
 */
const PRODUCT_IMAGE_SIZES =
  "(max-width: 767px) 44vw, (max-width: 1023px) 30vw, (max-width: 1600px) 15vw, 240px";

const PRODUCT_IMAGE_CLASS =
  "absolute inset-0 w-full h-full object-cover group-hover:scale-[1.07] transition-transform duration-500 ease-out";

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
  /**
   * Load this card's image immediately instead of lazily.
   *
   * For cards that start on screen. Native lazy loading does not reliably
   * request an in-viewport image on a reload — measured repeatedly on the
   * homepage: 45 image requests on a first load, 9 on the reload, and the only
   * card that ever appeared was the one already loading eagerly. Every attempt
   * to rescue the lazy ones failed (an IntersectionObserver over them fires no
   * callbacks at all), while eager worked in every single test.
   *
   * So above-the-fold cards opt out of lazy loading. Below-the-fold ones keep
   * it: they are the reason it exists.
   */
  eager?: boolean;
}

/**
 * Rescues images that native lazy-loading decides not to load.
 *
 * On a reload — not a first visit, a reload — Chrome leaves `loading="lazy"`
 * images sitting in the viewport with `complete === false` and an empty
 * `currentSrc`, having never requested them. Measured on the homepage at
 * 1440x900: 11 product images in view, 45 image requests on the first load
 * and 9 on the reload, with only the one `eager` card ever appearing. The
 * cards were not invisible, they were empty. Scrolling did not shake them
 * loose; setting `loading = "eager"` loaded all 11 at once, which is what
 * this does.
 *
 * One observer for every card rather than one each: 65 of them on the
 * homepage, and IntersectionObserver is used instead of reading rects on
 * mount precisely so this cannot force a synchronous layout of all 65.
 *
 * Cards unobserve themselves once handled, so this costs nothing after the
 * first screen settles, and nothing at all on a first visit, where lazy
 * loading behaves.
 */
let lazyRescue: IntersectionObserver | null = null;
function rescueWhenVisible(img: HTMLImageElement | null) {
  if (!img || typeof IntersectionObserver === "undefined") return;
  if (!lazyRescue) {
    lazyRescue = new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLImageElement;
        // Already loading or loaded: nothing to rescue, just stop watching.
        if (!el.complete && el.loading === "lazy") el.loading = "eager";
        observer.unobserve(el);
      }
    // Match the intent of lazy loading rather than defeating it: only images
    // actually approaching the viewport are forced.
    }, { rootMargin: "200px" });
  }
  lazyRescue.observe(img);
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
export function ProductCard({ product, onClick, priority, eager }: ProductCardProps) {
  const categoryLabel = product.categoryRef?.name || product.category || "Product";
  // CJ's hotlinked CDN images occasionally go dead — next/image renders
  // nothing visible when a remote image 404s/errors, which looked like a
  // blank, borderless hole in the grid. Track load failure and fall back
  // to the same placeholder used for a missing imageUrl.
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = product.imageUrl && !imageFailed;

  /**
   * Catches a dead image so the "No Image" placeholder can take over.
   *
   * The onError prop alone is not enough: it is a React synthetic handler
   * attached during commit, and an image that fails before that — from cache,
   * on a reload — never reaches it. Checking at ref-attach time and adding a
   * native listener covers both.
   *
   * `complete` is deliberately not trusted on its own. It is also true for an
   * <img> that has no src yet, which is exactly what this ref sees during
   * hydration; an earlier version keyed off it, returned here, and skipped the
   * lazy-load rescue below entirely.
   */
  const onImageRef = useCallback((img: HTMLImageElement | null) => {
    if (!img) return;

    const checkFailed = () => {
      // `complete` is true for a failed image too; naturalWidth separates them.
      if (img.naturalWidth === 0) setImageFailed(true);
    };

    if (img.currentSrc && img.complete) {
      checkFailed();
      return;
    }

    img.addEventListener("load", checkFailed, { once: true });
    img.addEventListener("error", () => setImageFailed(true), { once: true });
    rescueWhenVisible(img);
  }, []);

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
          {/* No fade-in on either branch. The image used to start at opacity-0
              and transition to opacity-100 once onLoad fired, and that is what
              made "images are not showing": on a reload the card ended up with
              the opacity-100 class applied and a computed opacity of 0, a
              transition that had started and never finished, over an image
              that was fully downloaded the whole time. A decorative 500ms fade
              is not worth a failure mode that hides the product catalogue. */}
          {!showImage ? (
            <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm">No Image</div>
          ) : priority ? (
            /* The LCP candidate stays on next/image, deliberately.
               next/image emits the <link rel="preload"> that gets this one
               image requested before the parser reaches it, and that matters
               now that first paint is no longer the bottleneck: the LCP image
               is the last thing the page waits for. A srcSet would buy this
               card ~20 kB on a 1x desktop and cost it that preload, which is
               the wrong trade for the one image LCP is measured against. */
            <Image
              ref={onImageRef}
              src={getCdnUrl(product.imageUrl, 400) as string}
              alt={product.name}
              width={400}
              height={400}
              priority
              sizes={PRODUCT_IMAGE_SIZES}
              className={PRODUCT_IMAGE_CLASS}
              onError={() => setImageFailed(true)}
            />
          ) : (
            /* Every other card is a hand-written <img> so it can carry a
               srcSet. next/image assigns srcSet itself after spreading the
               caller's props, and assigns undefined under images.unoptimized,
               so one passed in is silently dropped. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={onImageRef}
              src={getCdnUrl(product.imageUrl, 400) as string}
              srcSet={PRODUCT_IMAGE_WIDTHS.map((w) => `${getCdnUrl(product.imageUrl, w)} ${w}w`).join(", ")}
              sizes={PRODUCT_IMAGE_SIZES}
              alt={product.name}
              width={400}
              height={400}
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              className={PRODUCT_IMAGE_CLASS}
              onError={() => setImageFailed(true)}
            />
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
