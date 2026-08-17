"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronLeft, Loader2, LayoutGrid } from "lucide-react";
import { FooterSection } from "@/components/sections/FooterSection";
import { InquiryModal } from "@/components/ui/InquiryModal";
import { ProductCard } from "@/components/ui/ProductCard";
import { Pagination } from "@/components/ui/Pagination";
import { BorderBeamPanel } from "@/components/ui/border-beam-panel";
import { buildCategoryTree } from "@/lib/categoryTree";
import { getCdnUrl } from "@/lib/cdn";

type RankProduct = { id: number; name: string; imageUrl: string | null; rank: number };
type RankGroup = { id: string; name: string; parentName: string | null; products: RankProduct[] };
type Tab = "hot" | "popular" | "all";

const ALL_PAGE_SIZE = 60;
const GROUP_PAGE = 15;

// Rank badge colours — #1 gold, #2 silver, #3 bronze/orange (Alibaba-style).
function rankStyle(rank: number): string {
  if (rank === 1) return "bg-gradient-to-br from-amber-400 to-amber-500";
  if (rank === 2) return "bg-gradient-to-br from-slate-300 to-slate-400";
  return "bg-gradient-to-br from-orange-400 to-orange-500";
}

function RankTile({ product, onClick }: { product: RankProduct; onClick: () => void }) {
  const [failed, setFailed] = useState(false);
  const show = product.imageUrl && !failed;
  return (
    <button onClick={onClick} className="group/tile flex flex-col text-left w-full">
      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200/70">
        <span className={`absolute top-0 left-0 z-10 flex items-center justify-center w-6 h-6 rounded-br-lg text-white text-[11px] font-black shadow-sm ${rankStyle(product.rank)}`}>
          {product.rank}
        </span>
        {show ? (
          <Image
            src={getCdnUrl(product.imageUrl) as string}
            alt={product.name}
            fill
            loading="lazy"
            sizes="(max-width:768px) 30vw, 150px"
            className="object-cover group-hover/tile:scale-105 transition-transform duration-500"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300 text-[11px]">No Image</div>
        )}
      </div>
      <p className="mt-2 text-[11.5px] sm:text-xs font-medium text-slate-600 leading-snug line-clamp-2 group-hover/tile:text-brand-dark transition-colors">
        {product.name}
      </p>
    </button>
  );
}

function RankingCard({ group, onSelect, onViewAll, seed }: { group: RankGroup; onSelect: (p: RankProduct) => void; onViewAll: () => void; seed: number }) {
  return (
    <BorderBeamPanel
      beams={2}
      thickness={2}
      radius={20}
      glow={false}
      seed={seed}
      colors={["#27a8c4", "#f59e0b"]}
      className="!bg-white !border-slate-200/70 !p-4 sm:!p-5 shadow-sm hover:shadow-lg transition-shadow"
    >
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="font-extrabold text-slate-900 text-[15px] sm:text-base truncate tracking-tight">{group.name}</h3>
        <button onClick={onViewAll} className="shrink-0 inline-flex items-center gap-0.5 text-xs font-semibold text-brand-dark hover:gap-1.5 transition-all">
          View all <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {group.products.slice(0, 3).map((p) => (
          <RankTile key={p.id} product={p} onClick={() => onSelect(p)} />
        ))}
      </div>
    </BorderBeamPanel>
  );
}

// A card-shaped skeleton (title bar + 3 image tiles) so the loading state reads
// as "cards are coming", not a blank slab.
function CardSkeleton() {
  return (
    <div className="liquid-glass-card p-4 sm:p-5">
      <div className="h-4 w-32 bg-slate-100 rounded mb-4 animate-pulse" />
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="aspect-square rounded-xl bg-slate-100 animate-pulse" />
            <div className="h-3 w-full bg-slate-100 rounded mt-2 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RankingsPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);
  const [scope, setScope] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("hot");

  const [groups, setGroups] = useState<RankGroup[]>([]);
  const [groupOffset, setGroupOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [allPage, setAllPage] = useState(1);
  const [allTotalPages, setAllTotalPages] = useState(1);
  const [allLoading, setAllLoading] = useState(false);

  const [inquiryProduct, setInquiryProduct] = useState<any | null>(null);
  const reqSeq = useRef(0);
  const scopeScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreLock = useRef(false);

  useEffect(() => {
    fetch("/api/categories", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setCategories(j.data || []))
      .catch(() => {});
  }, []);

  const topCategories = useMemo(() => buildCategoryTree(categories), [categories]);
  const scopeName = useMemo(
    () => (scope ? categories.find((c) => c.id === scope)?.name ?? "Category" : "All Categories"),
    [scope, categories]
  );

  const fetchGroups = useCallback((offset: number, append: boolean) => {
    const seq = ++reqSeq.current;
    if (append) setLoadingMore(true); else setLoading(true);
    const params = new URLSearchParams({ tab, offset: String(offset), limit: String(GROUP_PAGE) });
    if (scope) params.set("parentId", scope);
    fetch(`/api/rankings?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (seq !== reqSeq.current) return;
        setGroups((prev) => (append ? [...prev, ...(j.groups || [])] : j.groups || []));
        setHasMore(Boolean(j.hasMore));
        setGroupOffset(offset + GROUP_PAGE);
      })
      .catch(() => { if (seq === reqSeq.current && !append) setGroups([]); })
      .finally(() => { if (seq === reqSeq.current) { setLoading(false); setLoadingMore(false); loadMoreLock.current = false; } });
  }, [tab, scope]);

  // Reset & load first page when scope or tab changes.
  useEffect(() => {
    if (tab === "all") return;
    setGroups([]);
    setGroupOffset(0);
    setHasMore(false);
    fetchGroups(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, scope]);

  // Latest scroll state kept in a ref so the scroll handler always reads fresh
  // values without re-binding the listener on every state change.
  const scrollState = useRef({ hasMore, loading, loadingMore, groupOffset });
  useEffect(() => {
    scrollState.current = { hasMore, loading, loadingMore, groupOffset };
  });

  // Infinite scroll — auto-load every category as the user nears the bottom,
  // no button. A plain scroll listener (rather than IntersectionObserver) is
  // used because it is universally reliable and simple to reason about.
  useEffect(() => {
    if (tab === "all") return;
    const maybeLoad = () => {
      const s = scrollState.current;
      if (!s.hasMore || s.loading || s.loadingMore || loadMoreLock.current) return;
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 900) {
        loadMoreLock.current = true;
        fetchGroups(s.groupOffset, true);
      }
    };
    window.addEventListener("scroll", maybeLoad, { passive: true });
    window.addEventListener("resize", maybeLoad);
    return () => { window.removeEventListener("scroll", maybeLoad); window.removeEventListener("resize", maybeLoad); };
  }, [tab, fetchGroups]);

  // After each append, if the page is still short enough that we're near the
  // bottom, keep loading (covers wide screens where 15 cards don't fill it).
  useEffect(() => {
    if (tab === "all" || loading || loadingMore) return;
    const s = scrollState.current;
    if (s.hasMore && window.innerHeight + window.scrollY >= document.body.offsetHeight - 900 && !loadMoreLock.current) {
      loadMoreLock.current = true;
      fetchGroups(s.groupOffset, true);
    }
  }, [groups.length, tab, loading, loadingMore, fetchGroups]);

  // "All" tab product grid.
  useEffect(() => {
    if (tab !== "all") return;
    const seq = ++reqSeq.current;
    setAllLoading(true);
    const params = new URLSearchParams({ page: String(allPage), limit: String(ALL_PAGE_SIZE) });
    if (scope) params.set("categoryId", scope);
    fetch(`/api/products?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (seq !== reqSeq.current) return;
        setAllProducts(j.data || []);
        setAllTotalPages(j.pagination?.totalPages || 1);
      })
      .catch(() => { if (seq === reqSeq.current) setAllProducts([]); })
      .finally(() => { if (seq === reqSeq.current) setAllLoading(false); });
  }, [tab, scope, allPage]);

  useEffect(() => { setAllPage(1); }, [scope, tab]);

  const scrollScope = (dir: -1 | 1) => scopeScrollRef.current?.scrollBy({ left: dir * 300, behavior: "smooth" });
  const goToCategory = (id: string) => router.push(`/products?categoryId=${id}`);

  // Changing scope/tab reloads the whole grid — jump back to the top so the
  // user sees the new results from the start, not mid-scroll.
  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const selectScope = (id: string | null) => { setScope(id); scrollTop(); };
  const selectTab = (key: Tab) => { setTab(key); scrollTop(); };

  const tabs: { key: Tab; label: string }[] = [
    { key: "hot", label: "Hot selling" },
    { key: "popular", label: "Most popular" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans pt-20">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pb-12 pt-4">
        {/* Sticky control bar */}
        <div className="sticky top-[var(--nav-shift,5rem)] transition-[top] duration-300 z-30 bg-slate-50/95 backdrop-blur-sm -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-3 border-b border-slate-100">
          {/* Scope row — horizontal scroll with subtle edge arrows overlaid
              (no layout-shifting flanking buttons). */}
          <div className="relative">
            {/* md:px-10 reserves gutters so the overlay arrows never cover the
                first/last chip (that overlap was the "fucked up" carousel). */}
            <div ref={scopeScrollRef} className="flex gap-2 overflow-x-auto scrollbar-hide scroll-smooth md:px-10">
              <button
                onClick={() => selectScope(null)}
                className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-semibold border transition-colors ${
                  scope === null ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
                }`}
              >
                All categories
              </button>
              {topCategories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectScope(c.id)}
                  className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-semibold border transition-colors whitespace-nowrap ${
                    scope === c.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {/* Edge fade + overlay arrows (desktop only) */}
            <div className="hidden md:block pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-slate-50 to-transparent" />
            <div className="hidden md:block pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-slate-50 to-transparent" />
            <button onClick={() => scrollScope(-1)} aria-label="Scroll left" className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 w-7 h-7 items-center justify-center rounded-full bg-white/90 shadow ring-1 ring-slate-200 text-slate-500 hover:text-brand transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => scrollScope(1)} aria-label="Scroll right" className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 w-7 h-7 items-center justify-center rounded-full bg-white/90 shadow ring-1 ring-slate-200 text-slate-500 hover:text-brand transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Sub-tabs (left) + Full Catalogue link (right) */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-full">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => selectTab(t.key)}
                  className={`px-4 sm:px-5 py-1.5 rounded-full text-[13px] font-bold transition-colors ${
                    tab === t.key ? "bg-white text-brand-dark shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Link
              href="/products"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand"
            >
              <LayoutGrid className="w-4 h-4" /> <span className="hidden sm:inline">Full Catalogue</span>
            </Link>
          </div>
        </div>

        {/* Content — min-height keeps the footer below the fold while the
            first cards are still loading (no footer peeking under skeletons). */}
        <div className="mt-5 min-h-[80vh]">
          {tab === "all" ? (
            allLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
                {[...Array(18)].map((_, i) => <div key={i} className="h-[300px] bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-500 mb-4">Showing products in <span className="font-semibold text-slate-800">{scopeName}</span></p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
                  {allProducts.map((p, idx) => (
                    <ProductCard key={p.id} product={p} onClick={() => setInquiryProduct(p)} priority={idx < 12} />
                  ))}
                </div>
                {allProducts.length === 0 && (
                  <div className="text-center text-slate-500 py-16">No products found in this category yet.</div>
                )}
                <Pagination page={allPage} totalPages={allTotalPages} onPageChange={(p) => { setAllPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
              </>
            )
          ) : loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(9)].map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center text-slate-400 py-20">No rankings available for this category.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {groups.map((g, i) => (
                  <RankingCard key={g.id} group={g} seed={i + 1} onSelect={setInquiryProduct} onViewAll={() => goToCategory(g.id)} />
                ))}
              </div>
              {/* Infinite scroll auto-loads more as you near the bottom (no button) */}
              {loadingMore && (
                <div className="flex justify-center py-8 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
              )}
            </>
          )}
        </div>
      </div>

      <FooterSection />
      <InquiryModal product={inquiryProduct} onClose={() => setInquiryProduct(null)} />
    </div>
  );
}
