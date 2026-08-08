"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Star, ChevronRight } from "lucide-react";
import { InquiryModal } from "@/components/ui/InquiryModal";
import { ProductCard } from "@/components/ui/ProductCard";
import { CategoryMegaPanel } from "@/components/ui/CategoryMegaPanel";
import { HeroSearchSection } from "./HeroSearchSection";
import { TextMorph } from "@/components/ui/text-morph";
import { buildCategoryTree } from "@/lib/categoryTree";

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
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
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
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

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
          <h1 className="text-xl sm:text-2xl lg:text-[2rem] font-black tracking-tight text-slate-900 flex flex-wrap items-center justify-center gap-x-2">
            <span>Source</span>
            <TextMorph
              words={["Electronics", "Apparel", "Machinery", "Home & Living", "Beauty", "Auto Parts"]}
              interval={2200}
              className="text-brand"
            />
            <span>from one trusted partner</span>
          </h1>
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
              <div className="absolute inset-0 flex flex-col bg-[#f7f7f7] rounded-xl overflow-hidden z-30 border border-slate-100/50">
                <button
                  onClick={() => openMega(null)}
                  className="flex items-center px-4 py-2.5 cursor-pointer transition-colors w-full bg-[#f7f7f7] hover:bg-white border-b border-slate-200 group shrink-0 text-left"
                >
                  <div className="flex-1 text-[13px] font-medium text-slate-700 group-hover:text-brand-dark transition-colors flex items-center gap-3">
                    <Star className="w-4 h-4 text-slate-500 group-hover:text-brand transition-colors" />
                    Categories for you
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-brand transition-colors" />
                </button>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                  {topLevelCategories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => openMega(cat.id)}
                      className="w-full flex items-center justify-between px-4 py-2 text-left text-[13px] text-slate-700 hover:bg-white hover:text-brand-dark transition-colors"
                    >
                      <span className="truncate pr-2">{cat.name}</span>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
                {/* "View All" opens the full-category mega-panel (the toggle
                    screen), matching Alibaba's sidebar behavior — not a direct
                    jump to /products. Users drill into a category from there. */}
                <button
                  onClick={() => openMega(null)}
                  className="flex items-center px-4 py-2.5 cursor-pointer transition-colors w-full bg-[#f7f7f7] hover:bg-white border-t border-slate-200 group shrink-0 text-left"
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
                setIsMegaOpen(false);
                router.push(`/products?categoryId=${categoryId}`);
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
