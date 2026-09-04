"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Star, ChevronRight } from "lucide-react";
import { InquiryModal } from "@/components/ui/InquiryModal";
import { ProductCard, type ProductCardData } from "@/components/ui/ProductCard";
import { CategoryMegaPanel } from "@/components/ui/CategoryMegaPanel";
import { useBackDismiss, overlayWillNavigate } from "@/lib/useBackDismiss";
import { HeroSearchSection } from "./HeroSearchSection";
import { TextMorph } from "@/components/ui/text-morph";
import { buildCategoryTree, getCategoryIcon, type CategoryRecord } from "@/lib/categoryTree";
import { ShippingBar } from "@/components/ui/ShippingBar";
import { AffhanBrandBar } from "@/components/ui/AffhanBrandBar";

// The diverse-sample query can return overlapping products across paged
// load-more calls; dedupe by id so a duplicate React key never reaches the
// DOM.
function dedupeById<T extends { id: number | string }>(items: T[]): T[] {
  const seen = new Set<number | string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function MarketplaceHeroSection() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loadMoreLock = useRef(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  // Mega-panel: click-to-open (not hover), so hovering the sidebar never
  // dims/blurs the page. `megaInitialId` scrolls the panel to the clicked
  // category, matching the navbar's "All Categories" behavior.
  const [isMegaOpen, setIsMegaOpen] = useState(false);

  // Back closes the mega menu before it leaves the page.
  useBackDismiss(isMegaOpen, () => setIsMegaOpen(false));
  const [megaInitialId, setMegaInitialId] = useState<string | null>(null);

  const openMega = (categoryId: string | null) => {
    setMegaInitialId(categoryId);
    setIsMegaOpen(true);
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

  // Fetch Categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch("/api/categories", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          setCategories(json.data || []);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchCategories();
  }, []);

  const topLevelCategories = useMemo(() => buildCategoryTree(categories), [categories]);

  // Fetch the diverse product mix once.
  useEffect(() => {
    const fetchProducts = async () => {
      const seq = ++requestSeq.current;
      try {
        setLoading(true);
        // A fixed, modest set — no infinite scroll on the homepage. The old
        // load-more kept appending up to ~200 products as you scrolled, which
        // continually grew the page and pushed the Trending section away. A
        // stable set keeps the page height fixed and Trending reachable.
        const res = await fetch(`/api/products?limit=61`);
        if (res.ok) {
          const json = await res.json();
          if (seq !== requestSeq.current) return;
          setProducts(dedupeById(json.data || []));
          setHasMore(false);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  // Infinite Scroll Handler
  useEffect(() => {
    const observer = new IntersectionObserver(
      async (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore && hasMore && !loadMoreLock.current && products.length < 198 && !error) {
          loadMoreLock.current = true;
          setLoadingMore(true);
          setError(null);
          const seq = ++requestSeq.current;
          try {
            const excludeIds = products.map(p => p.id).join(',');
            const res = await fetch(`/api/products?excludeIds=${excludeIds}`);
            if (seq !== requestSeq.current) return;
            if (res.ok) {
              const json = await res.json();
              const newProducts = json.data || [];
              if (newProducts.length === 0) {
                setHasMore(false);
              } else {
                setProducts(prev => {
                  const combined = dedupeById([...prev, ...newProducts]);
                  if (combined.length >= 198) {
                    setHasMore(false);
                    return combined.slice(0, 198);
                  }
                  return combined;
                });
              }
            } else {
              setError("Failed to load more products");
              setHasMore(false);
            }
          } catch (err) {
            console.error(err);
            setError("Network error occurred");
            setHasMore(false);
          } finally {
            if (seq === requestSeq.current) setLoadingMore(false);
            loadMoreLock.current = false;
          }
        }
      },
      { threshold: 0.1, rootMargin: '400px' }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) observer.observe(currentTarget);
    return () => {
      if (currentTarget) observer.unobserve(currentTarget);
    };
  }, [loading, loadingMore, hasMore, products, error]);

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
              @keyframes b2bFlow { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
              @keyframes b2bShine { 0% { transform: translateX(-160%) skewX(-18deg); } 100% { transform: translateX(260%) skewX(-18deg); } }
              @keyframes b2bRipple { 0% { transform: scale(0); opacity: 0.45; } 100% { transform: scale(2.8); opacity: 0; } }
              .b2b-badge { background: linear-gradient(115deg, #ffffff 0%, #eaf9fc 22%, #cdeef7 42%, #ffffff 66%, #eaf9fc 100%); background-size: 220% 100%; animation: b2bFlow 8s linear infinite; }
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
              @keyframes waterRipple {
                0%, 79% {
                  opacity: 0;
                  transform: translate(-50%, 310px) scale(0.1);
                  border-width: 2px;
                }
                80% {
                  opacity: 1;
                  transform: translate(-50%, 310px) scale(0.1);
                  border-width: 2px;
                }
                88% {
                  opacity: 0;
                  transform: translate(-50%, 310px) scale(1.5);
                  border-width: 0.5px;
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
                will-change: transform, opacity;
              }
              .b2b-bead-ripple {
                position: absolute; top: 80%; left: 50%; width: 24px; height: 8px; border-radius: 50%; background: transparent; 
                border: 2px solid rgba(14,165,233,0.8);
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
              @media (hover: hover) and (pointer: fine) {
                .peer:hover ~ .water-droplets-area .b2b-bead-lg,
                .peer:hover ~ .water-droplets-area .b2b-bead-ripple,
                .peer:hover ~ .water-droplets-area .b2b-bead-rebound {
                  animation-play-state: running;
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
              @media (prefers-reduced-motion: reduce) { .b2b-badge, .b2b-bead { animation: none; } .b2b-beads { opacity: 0; } }
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

            {/* The realistic water droplets covering the whole title area */}
            <div className="water-droplets-area" aria-hidden="true">
              {[...Array(18)].map((_, i) => (
                <span key={`bead-l${i + 1}`} className={`b2b-bead-wrapper bead-l${i + 1}`}>
                  <span className="b2b-bead-lg" />
                  <span className="b2b-bead-ripple" />
                  <span className="b2b-bead-rebound" />
                </span>
              ))}
            </div>
          </div>
          {/* SEO Static H1 (Visually hidden) */}
          <h1 className="sr-only">
            AFFHAN - Global Sourcing, Shipping & China Import Export
          </h1>
          <div aria-hidden="true" className="text-xl sm:text-2xl lg:text-[2rem] font-black tracking-tight text-slate-900 flex flex-wrap items-center justify-center gap-x-2">
            <span>Source</span>
            <TextMorph
              words={["Electronics", "Apparel", "Machinery", "Home & Living", "Beauty", "Auto Parts"]}
              interval={2200}
              className="text-brand"
            />
            <span>from one trusted partner</span>
          </div>
        </div>

        {/* Large Hero Search Section */}
        <HeroSearchSection />

        {/* CSS Grid Auto-flow Container */}
        <div className="hidden lg:grid lg:grid-cols-6 gap-4 xl:gap-5 pb-8 relative">

          {/* Sidebar — spans a single grid row so it's exactly one product
                card tall (its background fills the cell with no leftover grey
                gap), scrolling internally if the category list is longer.
                Clicking a category opens the same full mega-panel the navbar
                uses (centered modal); no hover means no page dim/blur. */}
          <div className="col-span-1 relative">
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
                {topLevelCategories.map(cat => {
                  const Icon = getCategoryIcon(cat.name);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => openMega(cat.id)}
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
            displayProducts.map((product, idx) => (
              <div key={product.id} className="col-span-1 flex items-start">
                <ProductCard product={product} onClick={() => setSelectedProduct(product)} priority={idx < 12} />
              </div>
            ))
          )}

          {loadingMore && (
            <div className="col-span-full py-8 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
            </div>
          )}

          {!loading && !hasMore && displayProducts.length > 0 && (
            <div className="col-span-full py-6 text-center text-slate-400 text-sm font-medium">
              You&apos;ve reached the end of recommendations
            </div>
          )}
        </div>

        {/* Mobile Fallback Grid */}
        <div className="lg:hidden pb-8">
          <div className="flex items-end pt-2 pb-4">
            <h2 className="text-xl font-black text-slate-900">Explore the Latest Global Inventory</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {loading ? (
              [...Array(12)].map((_, i) => (
                <div key={i} className="h-[300px] bg-slate-200 animate-pulse rounded-xl w-full" />
              ))
            ) : (
              displayProducts.map((product, idx) => (
                <div key={product.id} className="col-span-1">
                  <ProductCard product={product} onClick={() => setSelectedProduct(product)} priority={idx < 6} />
                </div>
              ))
            )}

            {loadingMore && (
              <div className="col-span-full py-8 flex justify-center w-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
              </div>
            )}

            {error && (
              <div className="col-span-full py-8 flex flex-col items-center w-full">
                <p className="text-red-500 mb-4">{error}</p>
                <button
                  onClick={() => { setError(null); setHasMore(true); }}
                  className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold transition-colors"
                >
                  Retry Loading
                </button>
              </div>
            )}
          </div>
        </div>

        <div ref={observerTarget} className="h-10 w-full" />
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
            <CategoryMegaPanel
              tree={topLevelCategories}
              initialActiveId={megaInitialId}
              onNavigate={(categoryId) => {
                // Signal before closing: the close pops this overlay's history
                // entry, and that pop cancels the router.push below.
                overlayWillNavigate();
                setIsMegaOpen(false);
                router.push(`/products/?categoryId=${categoryId}`);
              }}
            />
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
