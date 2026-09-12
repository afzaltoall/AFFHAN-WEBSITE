"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Star, ChevronRight } from "lucide-react";
import dynamic from 'next/dynamic';
const InquiryModal = dynamic(() => import("@/components/ui/InquiryModal").then(mod => mod.InquiryModal), { ssr: false });
import { ProductCard, type ProductCardData } from "@/components/ui/ProductCard";
import { CategoryMegaPanel } from "@/components/ui/CategoryMegaPanel";
import { useBackDismiss, overlayWillNavigate } from "@/lib/useBackDismiss";
import { HeroSearchSection } from "./HeroSearchSection";
import { TextMorph } from "@/components/ui/text-morph-wrapper";
import { buildCategoryTree, getCategoryIcon, type CategoryTreeNode } from "@/lib/categoryTree";
import { ShippingBar } from "@/components/ui/ShippingBar";
import { AffhanBrandBar } from "@/components/ui/AffhanBrandBar";
import { loadAllCategories } from "@/lib/categoriesClient";

/** The two small slices the first screen needs, in place of all 668 rows. */
export interface SidebarCategory { id: string; name: string; }
export interface SearchCategory {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  productCount: number;
}

export function MarketplaceHeroSection({
  initialProducts = [],
  sidebarCategories = [],
  searchCategories = [],
}: {
  initialProducts?: ProductCardData[];
  /** Top-level names for the sidebar rail. */
  sidebarCategories?: SidebarCategory[];
  /** The eight biggest categories, as search shortcuts. */
  searchCategories?: SearchCategory[];
}) {
  const router = useRouter();
  // The full grid, rendered in one go — no infinite scroll, no pagination.
  // The server sends exactly HERO_GRID_COUNT products, already rotated for
  // this ISR cycle, so this renders what it is given.
  const products = initialProducts;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The post-hydration reshuffle that used to sit here is gone.
  //
  // It re-picked 65 products out of an over-sized 240 so that every refresh
  // looked different, and it cost a second full render of the grid one frame
  // after the first — plus the 175 extra products in the payload that existed
  // only to be shuffled out of it. Rotation happens on the server now, once
  // per ISR cycle; see splitHeroPool in lib/heroPool.ts.

  // Does this device have a pointer that can hover? See the droplet field
  // below for why it matters. Deliberately starts false: rendering nothing on
  // the server and nothing on the first client render is what keeps hydration
  // agreeing with itself, and the field is invisible until hover regardless.
  const [hoverCapable, setHoverCapable] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    setHoverCapable(mq.matches);
    // A laptop with a touchscreen can switch between the two, and a phone
    // plugged into a mouse changes on the fly.
    const onChange = (e: MediaQueryListEvent) => setHoverCapable(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Mega-panel: click-to-open (not hover), so hovering the sidebar never
  // dims/blurs the page. `megaInitialId` scrolls the panel to the clicked
  // category, matching the navbar's "All Categories" behavior.
  const [isMegaOpen, setIsMegaOpen] = useState(false);

  // Back closes the mega menu before it leaves the page.
  useBackDismiss(isMegaOpen, () => setIsMegaOpen(false));
  const [megaInitialId, setMegaInitialId] = useState<string | null>(null);

  // The mega-panel's tree, fetched rather than shipped.
  //
  // The whole 668-row category list is ~252KB of RSC payload and was being
  // sent to every visitor so that a panel behind a click could render. It now
  // arrives from /api/categories, which is already cached at the edge and is
  // the same endpoint the navbar's panel uses, so it is usually a warm hit.
  //
  // The request itself lives in loadAllCategories, at module scope, because
  // the navbar's category menu wants the same 252KB list and was already
  // prefetching it separately. Sharing one promise means one download and one
  // JSON parse per visit no matter which of them asks first.
  const [megaTree, setMegaTree] = useState<CategoryTreeNode[] | null>(null);
  const loadCategories = useCallback(() => loadAllCategories(), []);

  // Warm it while the browser has nothing else to do, so the panel opens
  // instantly without the list being on the critical path. buildCategoryTree
  // is deliberately NOT run here — that is the expensive half, and it waits
  // until the panel is actually opened.
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const h = w.requestIdleCallback(() => { void loadCategories(); }, { timeout: 5000 });
      return () => w.cancelIdleCallback?.(h);
    }
    // Safari has no requestIdleCallback; a plain delay is close enough for a
    // prefetch whose only job is to not compete with hydration.
    const t = window.setTimeout(() => { void loadCategories(); }, 3000);
    return () => window.clearTimeout(t);
  }, [loadCategories]);

  const openMega = (categoryId: string | null) => {
    setMegaInitialId(categoryId);
    setIsMegaOpen(true);
    // Open first, resolve the tree after. The idle prefetch has usually
    // finished by the time anyone clicks, in which case this settles in the
    // same tick and the panel never shows its loading state.
    if (!megaTree) {
      void loadCategories().then((cats) => {
        if (cats.length) setMegaTree(buildCategoryTree(cats));
      });
    }
  };

  // The hero search bar sits at a high z-index so its suggestions float over
  // content; when the mega-panel opens it would otherwise show through the
  // panel. Reuse the same `megaMenuToggle` event the navbar already fires so
  // the search bar fades out while the panel is open.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("megaMenuToggle", { detail: isMegaOpen }));
  }, [isMegaOpen]);

  // Modal state
  const [selectedProduct, setSelectedProduct] = useState<ProductCardData | null>(null);


  // The IntersectionObserver that used to sit here is gone. The grid is a
  // fixed set of HERO_GRID_COUNT products delivered in one go, so there is
  // nothing left to page in — it previously fetched /api/products on scroll
  // and grew the grid to 198.

  // The desktop grid is 6 columns with the sidebar occupying col 1 of the
  // first row only, so 5 products sit beside it in row 1 and everything
  // after flows 6-per-row. Trim the tail to whole rows of 6 so the grid
  // never ends on a ragged partial row (the "2-3 products left" empty gap).
  const displayProducts = useMemo(() => {
    if (products.length <= 5) return products;
    const whole = 5 + Math.floor((products.length - 5) / 6) * 6;
    return products.slice(0, whole);
  }, [products]);

  return (
    <section className="pt-24 pb-12 bg-slate-50 min-h-screen">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">

        {/* Animated intro headline — a morphing category word gives the opening
            screen a lively "we can source anything" strapline. */}
        <div className="text-center pt-1 pb-3 sm:pb-4">
          <div className="relative mb-3 flex justify-center">
            <AffhanBrandBar />
            <ShippingBar />
            <style dangerouslySetInnerHTML={{
              __html: `
              /* One tile's worth of travel, as a transform. background-position
                 cannot be composited, so the old version repainted the pill
                 every frame for the life of the page. The sweep now lives on a
                 ::before that is two tiles wide and slides exactly one tile,
                 which loops seamlessly because the gradient repeats. */
              @keyframes b2bFlow { from { transform: translateX(0); } to { transform: translateX(-50%); } }
              @keyframes b2bShine { 0% { transform: translateX(-160%) skewX(-18deg); } 100% { transform: translateX(260%) skewX(-18deg); } }
              @keyframes b2bRipple { 0% { transform: scale(0); opacity: 0.45; } 100% { transform: scale(2.8); opacity: 0; } }
              /* isolation, so the z-index:-1 sweep below stays inside the pill
                 rather than sliding behind the section. The pill keeps a solid
                 base colour because the gradient has moved off it. */
              .b2b-badge { background: #ffffff; isolation: isolate; }
              .b2b-badge::before {
                content: ""; position: absolute; top: 0; left: 0; height: 100%;
                width: 440%; z-index: -1; pointer-events: none;
                /* Two tiles of the original 220% gradient, side by side, so a
                   50% slide lands exactly on the next tile and the loop has no
                   seam. */
                background: linear-gradient(115deg, #ffffff 0%, #eaf9fc 22%, #cdeef7 42%, #ffffff 66%, #eaf9fc 100%) 0 0 / 50% 100% repeat-x;
                animation: b2bFlow 8s linear infinite;
                will-change: transform;
              }
              .b2b-sheen { position:absolute; inset:0; background: linear-gradient(to bottom, rgba(255,255,255,0.7), rgba(255,255,255,0) 50%); }
              .b2b-shine { position:absolute; top:0; bottom:0; left:0; width:45%; transform: translateX(-160%) skewX(-18deg);
                background: linear-gradient(100deg, transparent, rgba(255,255,255,0.9), transparent); }
              .b2b-ripple { position:absolute; left:50%; top:50%; width:44px; height:44px; margin:-22px 0 0 -22px; border-radius:50%; transform:scale(0); opacity:0;
                background: radial-gradient(circle, rgba(39,168,196,0.4), rgba(39,168,196,0) 70%); }
              @media (hover: hover) and (pointer: fine) {
                .group:hover .b2b-shine { animation: b2bShine 0.9s ease-out; }
                .group:hover .b2b-ripple { animation: b2bRipple 0.85s ease-out; }
              }
              @keyframes b2bBead { 0% { transform: translateY(-30%) scale(0.6); opacity: 0; } 15% { transform: translateY(0) scale(1); opacity: 1; } 70% { opacity: 1; } 100% { transform: translateY(240%) scale(0.85); opacity: 0; } }
              .b2b-bead { position:absolute; top:-2px; border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;
                background: radial-gradient(ellipse 62% 55% at 38% 30%, rgba(255,255,255,0.97) 0%, rgba(224,242,254,0.35) 32%, rgba(186,230,253,0.5) 64%, rgba(14,165,233,0.85) 100%);
                border: 0.5px solid rgba(14,165,233,0.5);
                box-shadow: 0 2px 4px rgba(3,105,161,0.3), inset 0 -1.5px 2.5px rgba(2,132,199,0.4), inset 1px 1px 2px rgba(255,255,255,0.9);
                animation: b2bBead 3.4s linear infinite; will-change: transform, opacity; }

              /* NEW: Full area water droplets effect with EXPLOSIVE SPLASH */
              .water-droplets-area {
                position: absolute;
                top: -24px;
                bottom: -24px;
                left: 50%;
                width: 100vw;
                transform: translateX(-50%);
                pointer-events: none;
                z-index: 50;
                opacity: 0;
                transition: opacity 0.4s ease;
              }
              @media (hover: hover) and (pointer: fine) {
                .peer:hover ~ .water-droplets-area {
                  opacity: 1;
                }
              }
              .b2b-bead-wrapper {
                position: absolute;
                top: 0;
              }
              @keyframes b2bBeadLarge {
                0% { 
                  transform: translateY(-40px) scale(0.6); 
                  opacity: 0; 
                }
                5%, 15% { 
                  opacity: 1; 
                }
                78% {
                  transform: translateY(310px) scale(1);
                  opacity: 1;
                }
                79%, 100% { 
                  transform: translateY(310px) scale(1);
                  opacity: 0; 
                }
              }
              /* transform and opacity only. border-width used to animate here
                 (2px -> 0.5px) and it is a LAYOUT property: 36 ripples each
                 re-running layout and paint every frame, forever, is why
                 Lighthouse could never find a CPU idle window and GTmetrix
                 failed the page outright.

                 The border is a fixed 1px now and the thinning is gone. It was
                 never visible anyway: apparent thickness is border-width x
                 scale, so the old animation ran 0.2px -> 0.75px and the new one
                 runs 0.1px -> 1.5px, crossing at ~0.8px through the middle of
                 the 80%-88% window where the ripple is actually on screen. A
                 sub-pixel difference on a 24x8px decoration, in exchange for
                 the whole thing moving to the compositor. */
              @keyframes waterRipple {
                0%, 79% {
                  opacity: 0;
                  transform: translate(-50%, 310px) scale(0.1);
                }
                80% {
                  opacity: 1;
                  transform: translate(-50%, 310px) scale(0.1);
                }
                88% {
                  opacity: 0;
                  transform: translate(-50%, 310px) scale(1.5);
                }
                100% {
                  opacity: 0;
                }
              }
              @keyframes reboundDrop {
                0%, 79% {
                  opacity: 0;
                  transform: translate(-50%, 310px) scale(0);
                }
                80% {
                  opacity: 1;
                  transform: translate(-50%, 310px) scale(1);
                }
                85% {
                  transform: translate(-50%, 285px) scale(0.8);
                }
                90% {
                  opacity: 1;
                }
                95% {
                  opacity: 0;
                  transform: translate(-50%, 315px) scale(0.5);
                }
                100% {
                  opacity: 0;
                }
              }
              .b2b-bead-lg {
                position: absolute;
                inset: 0;
                border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
                background: radial-gradient(ellipse 62% 55% at 38% 30%, rgba(255,255,255,0.97) 0%, rgba(224,242,254,0.35) 32%, rgba(186,230,253,0.5) 64%, rgba(14,165,233,0.85) 100%);
                border: 0.5px solid rgba(14,165,233,0.5);
                box-shadow: 0 2px 4px rgba(3,105,161,0.3), inset 0 -1.5px 2.5px rgba(2,132,199,0.4), inset 1px 1px 2px rgba(255,255,255,0.9);
                animation: b2bBeadLarge var(--dur, 4s) linear infinite;
                animation-delay: var(--d, 0s);
                animation-play-state: paused;
              }
              .b2b-bead-ripple {
                position: absolute; top: 80%; left: 50%; width: 24px; height: 8px; border-radius: 50%; background: transparent;
                border: 1px solid rgba(14,165,233,0.8);
                box-shadow: 0 0 6px rgba(14,165,233,0.6), inset 0 0 4px rgba(14,165,233,0.4);
                transform: translate(-50%, 210px) scale(0.1);
                opacity: 0;
                animation: waterRipple var(--dur, 4s) ease-out infinite;
                animation-delay: var(--d, 0s);
                animation-play-state: paused;
              }
              .b2b-bead-rebound {
                position: absolute; top: 15%; left: 22%; width: 28%; height: 24%; border-radius: 50%; background: rgba(255,255,255,0.95);
                transform: translate(-50%, 210px) scale(0);
                opacity: 0;
                animation: reboundDrop var(--dur, 4s) cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
                animation-delay: var(--d, 0s);
                animation-play-state: paused;
              }
              /* will-change lives here, with animation-play-state, and not on
                 the rules above. It promotes an element to its own compositor
                 layer the moment it is declared, whether or not anything is
                 animating — and these droplets are paused inside an
                 opacity:0 container until the badge is hovered. That was 36
                 permanent layers for an effect that plays only on hover and,
                 on a touch device, can never play at all. Tying the hint to
                 the same selector that starts the animation means the layers
                 exist exactly while they earn their keep. */
              @media (hover: hover) and (pointer: fine) {
                .peer:hover ~ .water-droplets-area .b2b-bead-lg,
                .peer:hover ~ .water-droplets-area .b2b-bead-ripple,
                .peer:hover ~ .water-droplets-area .b2b-bead-rebound {
                  animation-play-state: running;
                  will-change: transform, opacity;
                }
              }
              .bead-l1 { left: 10%; width: 10px; height: 13px; --dur: 3.5s; --d: 0.2s; }
              .bead-l2 { left: 25%; width: 8px; height: 10px; --dur: 4.1s; --d: 1.5s; }
              .bead-l3 { left: 40%; width: 12px; height: 15px; --dur: 3.2s; --d: 0.8s; }
              .bead-l4 { left: 55%; width: 7px; height: 9px; --dur: 3.8s; --d: 2.1s; }
              .bead-l5 { left: 70%; width: 11px; height: 14px; --dur: 4.5s; --d: 0.5s; }
              .bead-l6 { left: 85%; width: 9px; height: 11px; --dur: 3.6s; --d: 1.2s; }
              .bead-l7 { left: 15%; width: 7px; height: 9px; --dur: 3.9s; --d: 2.7s; }
              .bead-l8 { left: 32%; width: 10px; height: 12px; --dur: 4.2s; --d: 0.9s; }
              .bead-l9 { left: 48%; width: 8px; height: 11px; --dur: 3.4s; --d: 2.3s; }
              .bead-l10 { left: 62%; width: 12px; height: 16px; --dur: 4.6s; --d: 1.8s; }
              .bead-l11 { left: 78%; width: 7px; height: 9px; --dur: 3.7s; --d: 0.4s; }
              .bead-l12 { left: 92%; width: 10px; height: 13px; --dur: 4.3s; --d: 1.6s; }
              .bead-l13 { left: 5%; width: 11px; height: 14px; --dur: 4.0s; --d: 1.1s; }
              .bead-l14 { left: 20%; width: 8px; height: 10px; --dur: 3.3s; --d: 2.5s; }
              .bead-l15 { left: 38%; width: 9px; height: 12px; --dur: 4.4s; --d: 0.3s; }
              .bead-l16 { left: 68%; width: 13px; height: 17px; --dur: 3.5s; --d: 2.0s; }
              .bead-l17 { left: 82%; width: 8px; height: 10px; --dur: 4.1s; --d: 0.7s; }
              .bead-l18 { left: 96%; width: 11px; height: 14px; --dur: 3.8s; --d: 2.8s; }
              .b2b-bead-lg::before {
                content: ""; position: absolute; top: 80%; left: 50%; width: 24px; height: 8px; border-radius: 50%; background: transparent; 
                border: 2px solid rgba(14,165,233,0.8);
                box-shadow: 0 0 6px rgba(14,165,233,0.6), inset 0 0 4px rgba(14,165,233,0.4);
                transform: translate(-50%, -50%) scale(0.1);
                opacity: 0;
                animation: waterRipple var(--dur, 4s) ease-out infinite;
                animation-delay: var(--d, 0s);
                animation-play-state: paused;
              }
              @media (hover: hover) and (pointer: fine) {
                .peer:hover ~ .water-droplets-area .b2b-bead-lg,
                .peer:hover ~ .water-droplets-area .b2b-bead-lg::after,
                .peer:hover ~ .water-droplets-area .b2b-bead-lg::before {
                  animation-play-state: running;
                }
              }
              .b2b-bead::after { content:""; position:absolute; top:15%; left:22%; width:28%; height:24%; border-radius:50%; background:rgba(255,255,255,0.95); }
              .b2b-bead-1 { left:12%; width:9px; height:11px; animation-delay:0s; }
              .b2b-bead-2 { left:30%; width:7px; height:9px; animation-delay:1.3s; animation-duration:3.9s; }
              .b2b-bead-3 { left:47%; width:6px; height:8px; animation-delay:2.5s; animation-duration:3.1s; }
              .b2b-bead-4 { left:63%; width:9px; height:11px; animation-delay:0.7s; animation-duration:4.2s; }
              .b2b-bead-5 { left:78%; width:7px; height:9px; animation-delay:1.9s; }
              .b2b-bead-6 { left:90%; width:6px; height:8px; animation-delay:3.0s; animation-duration:3.6s; }
              .b2b-beads { opacity: 0; transition: opacity 0.4s ease; }
              @media (hover: hover) and (pointer: fine) {
                .group:hover .b2b-beads { opacity: 1; }
                .group:hover .b2b-bead { animation-duration: 2s; }
              }
              /* .b2b-badge::before is named explicitly: the sweep moved off the
                 pill onto the pseudo-element, so stopping ".b2b-badge" alone
                 would have quietly left it running for exactly the people who
                 asked for no motion. */
              @media (prefers-reduced-motion: reduce) { .b2b-badge, .b2b-badge::before, .b2b-bead { animation: none; } .b2b-beads { opacity: 0; } }
            ` }} />
            <span className="group b2b-badge peer relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-brand/30 px-4 py-1.5 shadow-[0_8px_24px_-10px_rgba(23,101,121,0.5)] backdrop-blur-sm transition-all duration-300 hover:shadow-[0_12px_30px_-8px_rgba(39,168,196,0.6)] hover:-translate-y-0.5">
              {/* Liquid-glass layers: a soft top sheen, a light shine that sweeps
                  across on hover, and a ripple that blooms from the centre on
                  hover. All clipped to the pill by overflow-hidden. */}
              <span aria-hidden="true" className="b2b-sheen pointer-events-none" />
              <span aria-hidden="true" className="b2b-shine pointer-events-none" />
              <span aria-hidden="true" className="b2b-ripple pointer-events-none" />
              {/* Glassy water droplets trickling down — same bead look as the
                  floating Instagram button (radial glass gradient, specular
                  highlight, teal rim, cast shadow). Faster on hover. */}
              <span aria-hidden="true" className="b2b-beads pointer-events-none absolute inset-0">
                <span className="b2b-bead b2b-bead-1" />
                <span className="b2b-bead b2b-bead-2" />
                <span className="b2b-bead b2b-bead-3" />
                <span className="b2b-bead b2b-bead-4" />
                <span className="b2b-bead b2b-bead-5" />
                <span className="b2b-bead b2b-bead-6" />
              </span>
              {/* Custom 3D network globe */}
              <Image 
                src="/B2B/globe-transparent.png" 
                alt="Global B2B" 
                width={20} 
                height={20} 
                className="relative z-10 h-5 w-5 shrink-0 object-contain" 
                aria-hidden="true" 
              />
              <span className="relative z-10 text-[10px] font-extrabold uppercase tracking-[0.2em] text-brand-dark sm:text-[11px]">
                Global <span className="text-brand">B2B</span> Sourcing Marketplace
              </span>
            </span>

            {/* The realistic water droplets covering the whole title area.

                Rendered only where they can actually run. Every animation in
                this field is animation-play-state: paused inside an opacity:0
                container until `.peer:hover ~ .water-droplets-area` matches,
                and that selector sits inside
                @media (hover: hover) and (pointer: fine) — so on a touch
                device it can never match and the field can never play. It was
                still being sent to every phone: 54 spans, 18 more pseudo
                elements, and ~42KB of the HTML document, for an effect no
                phone can trigger.

                Gating on the media query in JS rather than CSS because CSS can
                hide these but cannot stop them being parsed into DOM. The flag
                starts false so the server and the first client render agree;
                the field appears a tick after hydration on hover-capable
                devices, which is invisible because it is transparent until the
                badge is hovered anyway. */}
            {hoverCapable && (
            <div className="water-droplets-area" aria-hidden="true">
              {[...Array(18)].map((_, i) => (
                <span key={`bead-l${i + 1}`} className={`b2b-bead-wrapper bead-l${i + 1}`}>
                  <span className="b2b-bead-lg" />
                  <span className="b2b-bead-ripple" />
                  <span className="b2b-bead-rebound" />
                </span>
              ))}
            </div>
            )}
          </div>
          {/* SEO Static H1 (Visually hidden) */}
          <h1 className="sr-only">
            AFFHAN - Global Sourcing, Shipping & China Import Export
          </h1>
          <div aria-hidden="true" className="text-xl sm:text-2xl lg:text-[2rem] font-black tracking-tight text-slate-900 flex flex-wrap items-center justify-center gap-x-2">
            <span>Source</span>
            {/* Fixed width, and the gap either side of a short word is the
                deliberate cost of it.
                This was briefly changed to size to its content, which removed
                the gap — and put a layout shift on every word change, forever.
                Measured on production: four recurring shifts attributed to
                `DIV.flex.justify-center.shrink-0 , SPAN` at 8.7s, 10.9s, 13.1s
                and 15.3s, one per 2.2s rotation. Individually tiny, but they
                never stop, and CLS is cumulative.
                240px fits the longest word ("Home & Living"); anything shorter
                is centred in it. A visible gap beats a metric that degrades for
                as long as the tab is open. */}
            {/* The gap and the layout shift are the same problem seen from two
                sides: a centred line cannot hold a variable-width word without
                something moving. Sizing the box to its content removed the gap
                and added a shift on every rotation; a box sized for the longest
                word removes the shift and leaves a gap beside the short ones.
                So the fix is to stop the words varying so much. These are all
                8-11 characters, against 6 ("Beauty") to 13 ("Home & Living")
                before, which lets the box be 190px instead of 240px. Worst-case
                gap drops from roughly 130px to under 30px, and CLS stays at 0. */}
            <div className="flex justify-center w-[120px] sm:w-[150px] lg:w-[190px] shrink-0">
              <TextMorph
                words={["Electronics", "Machinery", "Auto Parts", "Furniture", "Textiles", "Packaging"]}
                interval={2200}
                className="text-brand whitespace-nowrap"
              />
            </div>
            <span>from one trusted partner</span>
          </div>
        </div>

        {/* Large Hero Search Section */}
        <HeroSearchSection categories={searchCategories} />

        {/* Mobile Fallback Header */}
        <div className="flex lg:hidden items-end pt-2 pb-4">
          <h2 className="text-xl font-black text-slate-900">Explore the Latest Global Inventory</h2>
        </div>

        {/* Unified Responsive Grid */}
        <div className="hero-product-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 xl:gap-5 pb-8 relative">

          {/* Sidebar — spans a single grid row so it's exactly one product
                card tall (its background fills the cell with no leftover grey
                gap), scrolling internally if the category list is longer.
                Clicking a category opens the same full mega-panel the navbar
                uses (centered modal); no hover means no page dim/blur. */}
          <div className="hidden lg:flex col-span-1 relative">
            {/* Same liquid-glass-card the product cards beside it use, borders
                included. It previously carried !border-none, which removed the
                white top/left highlight and the darker bottom/right edge — the
                two things that make the surface read as glass rather than as a
                flat translucent panel. */}
            <div className="absolute inset-0 flex flex-col liquid-glass-card overflow-hidden z-30">
              <button
                onClick={() => openMega(null)}
                className="flex items-center px-4 py-3 cursor-pointer transition-colors w-full hover:bg-white/40 border-b border-slate-200/50 group shrink-0 text-left"
              >
                <div className="flex-1 text-[13px] font-medium text-slate-700 group-hover:text-brand-dark transition-colors flex items-center gap-3">
                  <Star className="w-4 h-4 text-slate-500 group-hover:text-brand transition-colors" />
                  Categories for you
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-brand transition-colors" />
              </button>
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {sidebarCategories.map(cat => {
                  const Icon = getCategoryIcon(cat.name);
                  return (
                    // Straight to the listing. Opening the mega panel scrolled
                    // to the category was a second menu on top of the menu:
                    // one more click before any product, and indistinguishable
                    // from nothing having happened when the panel opened over
                    // the row that was just clicked. "View All" above and below
                    // still opens the panel — that is what it is for.
                    <button
                      key={cat.id}
                      onClick={() => router.push(`/products/?categoryId=${cat.id}`)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-left text-[13.5px] font-semibold text-slate-700 hover:bg-white/40 hover:text-brand-dark transition-colors group"
                    >
                      <div className="flex items-center gap-3 pr-2">
                        <Icon className="w-4 h-4 text-slate-500 group-hover:text-brand transition-colors shrink-0" />
                        <span className="break-words leading-tight">{cat.name}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-brand transition-colors" />
                    </button>
                  );
                })}
              </div>
              {/* "View All" opens the full-category mega-panel (the toggle
                    screen), matching Alibaba's sidebar behavior — not a direct
                    jump to /products. Users drill into a category from there. */}
              <button
                onClick={() => openMega(null)}
                className="flex items-center px-4 py-3 cursor-pointer transition-colors w-full hover:bg-white/40 border-t border-slate-200/50 group shrink-0 text-left"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-brand mr-3 shrink-0" />
                <span className="text-sm font-bold text-slate-700 group-hover:text-brand-dark flex-1 truncate transition-colors">
                  View All
                </span>
                <span className="text-slate-400 group-hover:text-brand font-bold transition-colors">›</span>
              </button>
            </div>
          </div>

          {/* Products */}
          {loading ? (
            [...Array(23)].map((_, i) => (
              <div key={i} className="col-span-1">
                <div className="h-[300px] bg-slate-200 animate-pulse rounded-xl w-full" />
              </div>
            ))
          ) : (
            /* Keyed by POSITION, not by product id.
               The grid always renders the same number of cards in the same
               slots; only which product occupies a slot changes when the
               post-hydration shuffle runs. Keying by product.id made React
               treat that as 65 removals and 65 insertions, so every card was
               a brand-new DOM node with no previous box — measured as shifts
               of "h 0->369" and CLS up to 0.24 at 4.5-6.3s.
               Keying by position lets React reuse the nodes and update their
               contents in place, so nothing is inserted and nothing below
               moves. useLayoutEffect alone could not fix this: on a throttled
               CPU hydration itself finishes at 4.5-6.3s, so the effect runs
               after the first paint no matter when it is scheduled. */
            displayProducts.map((product, idx) => (
              <div key={idx} className="col-span-1 flex items-start">
                {/* One priority image. Marking the whole leading row instead
                    was measured and was not better; neither was freezing the
                    leading cards so the LCP image could not be swapped. Both
                    were tried on production over 5-run samples and both landed
                    inside the run-to-run variance, so the simpler code stands.
                    See the note on LCP_STABLE_LEAD in lib/heroPool.ts. */}
                <ProductCard product={product} onClick={() => setSelectedProduct(product)} priority={idx === 0} eager={idx < 12} />
              </div>
            ))
          )}



          {error && (
            <div className="col-span-full py-8 flex flex-col items-center w-full">
              <p className="text-red-500 mb-4">{error}</p>
              <button
                onClick={() => setError(null)}
                className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold transition-colors"
              >
                Retry Loading
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Category mega-panel — centered modal, light dim, no blur. z-[70]
          sits above the hero search bar (z-[60]) so it can't bleed through. */}
      {isMegaOpen && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center pt-24">
          <div
            className="absolute inset-0 bg-slate-900/25"
            onClick={() => setIsMegaOpen(false)}
          />
          <div className="relative z-10">
            {/* The tree is fetched, not shipped, so it can be a moment behind
                the click. In practice the idle prefetch has already finished
                and this branch never renders; it exists for a cold click on a
                slow connection, where an empty panel would read as broken. */}
            {megaTree === null ? (
              <div
                role="status"
                aria-label="Loading categories"
                className="w-[min(92vw,1100px)] h-[min(70vh,560px)] rounded-2xl bg-white shadow-xl flex overflow-hidden"
              >
                <div className="w-56 shrink-0 border-r border-slate-100 p-3 space-y-2">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="h-7 rounded bg-slate-100 animate-pulse" />
                  ))}
                </div>
                <div className="flex-1 p-5 grid grid-cols-2 sm:grid-cols-3 gap-3 content-start">
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />
                  ))}
                </div>
              </div>
            ) : (
              <CategoryMegaPanel
                tree={megaTree}
                initialActiveId={megaInitialId}
                onNavigate={(categoryId) => {
                  // Signal before closing: the close pops this overlay's history
                  // entry, and that pop cancels the router.push below.
                  overlayWillNavigate();
                  setIsMegaOpen(false);
                  router.push(`/products/?categoryId=${categoryId}`);
                }}
              />
            )}
          </div>
        </div>
      )}

      {selectedProduct && (
        <InquiryModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </section>
  );
}
