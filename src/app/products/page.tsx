"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Search, X, ChevronRight, ChevronLeft, ChevronDown, ArrowUpDown, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { FooterSection } from "@/components/sections/FooterSection";
import { InquiryModal } from "@/components/ui/InquiryModal";
import { ProductCard } from "@/components/ui/ProductCard";
import { CategoryTile } from "@/components/ui/CategoryTile";
import { QuickLinkPill } from "@/components/ui/QuickLinkPill";
import { Pagination } from "@/components/ui/Pagination";
import { CatalogueScrollHero } from "@/components/sections/CatalogueScrollHero";
import { CatalogueDock } from "@/components/sections/CatalogueDock";
import { buildCategoryTree, flattenLeaves, type CategoryRecord, type CategoryTreeNode } from "@/lib/categoryTree";
import { prepCatalogueNav } from "@/lib/scroll";
import type { ProductCardData } from "@/components/ui/ProductCard";

interface FacetChip {
  id: string;
  name: string;
  parentName: string | null;
  thumbnailUrl: string | null;
  count: number;
}

// Chip shape derived from the in-memory category tree (rootChips, "More in
// X" siblings, popular subcategories) — distinct from FacetChip, which comes
// straight off the /api/products search-facets response.
interface CategoryChip {
  id: string;
  name: string;
  count: number;
  thumbnailUrl: string | null;
}

// Locate a node anywhere in the tree by id. Pure structural lookup (no
// component state), so it lives at module scope rather than being redefined
// (and needing to be a hook dependency) on every render.
function findTreeNode(nodes: CategoryTreeNode[], targetId: string): CategoryTreeNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    const found = findTreeNode(node.children || [], targetId);
    if (found) return found;
  }
  return null;
}

const PAGE_SIZE = 96; // divisible by 2/3/4/6 so every column layout fills whole rows

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "alpha", label: "A – Z" },
  { value: "za", label: "Z – A" },
];

// Custom sort control — a clean, on-brand replacement for the native <select>
// (native selects can't be styled consistently across browsers/OS).
function SortDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-brand/40 hover:text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand/25"
      >
        <ArrowUpDown size={14} className="text-brand" />
        <span className="min-w-[86px] text-left">{current.label}</span>
        <ChevronDown size={15} className={`text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-40 mt-2 w-52 origin-top overflow-hidden rounded-xl border border-slate-100 bg-white p-1 shadow-xl ring-1 ring-black/5"
        >
          {SORT_OPTIONS.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-brand/10 text-brand-dark" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {o.label}
                {active && <Check size={15} className="text-brand" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Reads ?q= / ?categoryId= reactively WITHOUT next/navigation's
// useSearchParams — that requires a Suspense boundary and, in this setup,
// the boundary re-suspended on the client and left the page stuck on its
// fallback. We read window.location and re-read on history changes
// (router.push patches pushState, which we hook) so same-page category
// navigations still update.
function useUrlParams() {
  // Start EMPTY so the first client render matches the server (which has no
  // window and renders search=""). Reading window.location.search on the initial
  // render instead would make a deep-linked /products?categoryId=X hydrate as the
  // category view while the server sent the default view — a hydration mismatch.
  // The effect below reads the real URL immediately after mount.
  const [search, setSearch] = useState<string>("");
  useEffect(() => {
    const update = () => {
      // The React state update (which drives the hero unmount) is async and can
      // paint one hero frame first — the "Discover/Deliver/Verify/Customize"
      // flash. So when we're navigating INTO a category/search view, hide the
      // opening scroll-hero and jump to the top SYNCHRONOUSLY via the DOM, right
      // here in the navigation handler — before the browser paints. React then
      // unmounts the (already hidden) hero and swaps in the category view with no
      // flash and no scroll lurch. Direct DOM writes are not React updates, so
      // this is safe to run inside Next's pushState/insertion-effect phase.
      if (/[?&](categoryId|q)=/.test(window.location.search)) {
        const hero = document.getElementById("catalogue-hero");
        if (hero) hero.style.display = "none";
        const el = document.documentElement;
        const prev = el.style.scrollBehavior;
        el.style.scrollBehavior = "auto";
        window.scrollTo(0, 0);
        el.style.scrollBehavior = prev;
      }
      // Reflect the URL into state on a microtask (before paint, but out of the
      // insertion-effect phase so it doesn't throw "must not schedule updates").
      queueMicrotask(() => setSearch(window.location.search));
    };
    window.addEventListener("popstate", update);
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args: Parameters<typeof origPush>) { origPush.apply(this, args); update(); };
    history.replaceState = function (...args: Parameters<typeof origReplace>) { origReplace.apply(this, args); update(); };
    // Initial read: set state SYNCHRONOUSLY (not via the microtask update()) so it
    // batches with the sibling setMounted(true) effect. That single re-render then
    // has both the real URL and mounted=true at once — so a deep-linked category
    // resolves to the category view directly, with no intermediate frame where
    // (mounted && search==="") would briefly render the hero.
    setSearch(window.location.search);
    return () => {
      window.removeEventListener("popstate", update);
      history.pushState = origPush;
      history.replaceState = origReplace;
    };
  }, []);
  return new URLSearchParams(search);
}

export default function ProductsPage() {
  const router = useRouter();
  // The opening scroll-hero is gated behind this. It stays false through the
  // server render AND the first client render, so a fresh mount at
  // /products?categoryId=X (navigating in from another page, or a reload) never
  // paints the hero before the category view — which is exactly the "1 second
  // hero flash". It also keeps SSR and hydration identical (no hero either side).
  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [facets, setFacets] = useState<FacetChip[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalCapped, setTotalCapped] = useState<boolean>(false);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Full catalogue opens A–Z by default (requested: "start from A to Z").
  const [sortBy, setSortBy] = useState("alpha");

  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalProductCount, setTotalProductCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [inquiryProduct, setInquiryProduct] = useState<ProductCardData | null>(null);

  // Guards against out-of-order responses (initial unfiltered fetch racing
  // the deep-linked ?q=/?categoryId= fetch that immediately follows).
  const requestSeq = useRef(0);
  // Horizontal scroller for the single-line "Related categories" carousel.
  const facetScrollRef = useRef<HTMLDivElement>(null);
  const gridTopRef = useRef<HTMLDivElement>(null);
  // Always-mounted scroll anchor just above the grid/skeleton, so paging can
  // scroll to the top of the results even while the grid is loading (the grid —
  // and gridTopRef — are unmounted behind the loading skeleton).
  const gridSectionRef = useRef<HTMLDivElement>(null);
  // Horizontal scroller for the breadcrumb trail.
  const crumbScrollRef = useRef<HTMLDivElement>(null);
  const scrollFacets = (dir: number) => facetScrollRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  const searchParams = useUrlParams();
  const spString = searchParams.toString();

  // Flip on after the first client render — see the `mounted` declaration above.
  useEffect(() => { setMounted(true); }, []);

  // Category is DERIVED straight from the URL (not a state synced via effect).
  // This is what kills the opening-hero "full screen scroll" glitch for EVERY
  // entry point — in-page tiles, the navbar mega-menu, search facets, the
  // breadcrumb, or a pasted link all change the URL, and the view (hero unmount)
  // updates in the very same render, before any scroll can replay the hero.
  const activeCategoryId = searchParams.get("categoryId") || null;

  // Keep the search box text / debounced query in sync with the URL.
  useEffect(() => {
    const q = searchParams.get("q") || "";
    setQuery(q);
    setDebouncedQuery(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spString]);

  // Fetch categories (one time) — used to expand a category to its
  // descendant ids and to name the "Browsing Category" badge.
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

  // Debounce search — skip the first run so a deep-linked ?q= isn't stomped.
  const isInitialRender = useRef(true);
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    const handler = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handler);
  }, [query]);

  const getCategoryIdsParam = (categoryId: string | null, allCats: CategoryRecord[]): string | null => {
    if (!categoryId) return null;
    if (!allCats.length) return categoryId;
    const descendants = (targetId: string): string[] => {
      const ids = [targetId];
      for (const child of allCats.filter(c => c.parentId === targetId)) {
        ids.push(...descendants(child.id));
      }
      return ids;
    };
    return descendants(categoryId).join(',');
  };

  const activeCategoryIdsParam = useMemo(
    () => getCategoryIdsParam(activeCategoryId, categories),
    [activeCategoryId, categories]
  );

  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);

  const toChip = (c: CategoryTreeNode): CategoryChip => ({
    id: c.id,
    name: c.name,
    count: c.recursiveProductCount as number,
    thumbnailUrl: (c.displayThumbnail ?? null) as string | null,
  });

  const rootChips = useMemo(
    () => categoryTree.map(toChip).sort((a, b) => a.name.localeCompare(b.name)),
    [categoryTree]
  );

  const popularSubcategories = useMemo(() => {
    // Deduplicated by id, which matters now that a category can be promoted:
    // a promoted node stands at the root as well as under its real parent, so
    // walking every root reaches its leaves twice. Measured before this was
    // added — 22 of the 48 tiles were the same category shown twice.
    const seen = new Set<string>();
    const allLeaves = categoryTree.flatMap(flattenLeaves).filter((leaf) => {
      if (seen.has(leaf.id)) return false;
      seen.add(leaf.id);
      return true;
    });
    return allLeaves
      .sort((a, b) => (b.recursiveProductCount - a.recursiveProductCount) || a.name.localeCompare(b.name))
      .slice(0, 48)
      .map(toChip);
  }, [categoryTree]);

  // The category row shown under the breadcrumb. Rules:
  //  • root (nothing active)        → top-level categories
  //  • active node WITH children    → its children (drill one level deeper)
  //  • active LEAF (no children)    → its siblings (parent's children), with the
  //    active leaf highlighted — so users never lose sibling browsing.
  const levelOptions = useMemo(() => {
    const byCount = (a: CategoryTreeNode, b: CategoryTreeNode) => (b.recursiveProductCount - a.recursiveProductCount) || a.name.localeCompare(b.name);
    if (!activeCategoryId || !categoryTree.length) {
      return { label: "Browse by Category", items: rootChips, activeId: null as string | null };
    }
    const active = findTreeNode(categoryTree, activeCategoryId);
    if (!active) return { label: "Browse by Category", items: rootChips, activeId: null as string | null };
    if (active.children?.length) {
      return { label: "Refine within this category", items: [...active.children].sort(byCount).map(toChip), activeId: null as string | null };
    }
    const parent = active.parentId ? findTreeNode(categoryTree, active.parentId) : null;
    const items = (parent ? [...parent.children].sort(byCount) : [active]).map(toChip);
    return { label: parent ? `More in ${parent.name}` : "Browse by Category", items, activeId: activeCategoryId };
  }, [activeCategoryId, categoryTree, rootChips]);

  // Full ancestor path (root → … → active) for the drill-down breadcrumb, so a
  // shopper always sees where they are and can jump back up any level.
  const categoryPath = useMemo(() => {
    if (!activeCategoryId || !categories.length) return [] as { id: string; name: string }[];
    const byId = new Map(categories.map(c => [c.id, c]));
    const path: { id: string; name: string }[] = [];
    let cur = byId.get(activeCategoryId);
    const guard = new Set<string>(); // defend against any accidental parent cycle
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      path.unshift({ id: cur.id, name: cur.name });
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return path;
  }, [activeCategoryId, categories]);

  // Keep the breadcrumb strip pinned to its RIGHT end. The trail is one
  // sideways-scrolling line, so it would otherwise sit at scroll-left 0 and show
  // "All Categories › <root>…" while the category you actually just opened — the
  // deepest crumb, the one answering "where am I" — stays off-screen to the
  // right. Drilling three levels deep on a phone made the header look like it
  // had not changed at all.
  useEffect(() => {
    const el = crumbScrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [categoryPath]);

  // Drill into (or, with null, clear) a category via the URL so it stays
  // shareable/back-button friendly. activeCategoryId is derived from the URL
  // (above), so pushing the new URL updates the view synchronously — no separate
  // state to flip, and no hero-replay window on any navigation path.
  const goToCategory = (categoryId: string | null) => {
    // Hide the hero + jump to top NOW, synchronously in the click — before the
    // async router.push runs — so the very next paint is the category view, not
    // a flash of the opening hero. (Only when entering a category; clearing to
    // null re-shows the default catalogue.)
    if (categoryId) prepCatalogueNav();
    const params = new URLSearchParams(searchParams.toString());
    if (categoryId) params.set("categoryId", categoryId);
    else params.delete("categoryId");
    router.push(`/products/?${params.toString()}`);
  };

  const fetchProducts = async (
    searchQuery: string,
    catId: string | null,
    sort: string,
    pageNum: number
  ) => {
    const seq = ++requestSeq.current;
    try {
      setLoading(true);
      setError(null);

      const finalCatId = catId;
      const params = new URLSearchParams();
      if (searchQuery) params.append("q", searchQuery);
      if (finalCatId) params.append("categoryId", finalCatId);
      if (sort) params.append("sortBy", sort);
      const isDefaultView = !searchQuery && !finalCatId;
      if (searchQuery || isDefaultView) params.append("getChips", "true");
      params.append("page", pageNum.toString());
      params.append("limit", String(PAGE_SIZE));

      const res = await fetch(`/api/products?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch products");
      const json = await res.json();
      if (seq !== requestSeq.current) return;

      setProducts(json.data);
      setFacets(json.facets || []);
      setTotalPages(json.pagination.totalPages);
      setTotalProductCount(json.pagination.total);
      setTotalCapped(Boolean(json.pagination.totalCapped));
    } catch (err) {
      if (seq === requestSeq.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchProducts(debouncedQuery, activeCategoryIdsParam, sortBy, 1);
  }, [debouncedQuery, activeCategoryIdsParam, sortBy]);

  // Clean landing on every category / search change. The default catalogue view
  // carries a very tall opening scroll-hero (~3.5k px) that unmounts the instant
  // a category or query becomes active; if we stay mid-scroll when it vanishes
  // the page collapses and the viewport lurches — the reported "glitch". So each
  // time the view swaps we deterministically land at the top of the fresh view.
  //
  // It MUST be an instant jump, not a smooth scroll. The app sets a GLOBAL
  // `scroll-behavior: smooth` (see <html data-scroll-behavior="smooth">), and a
  // scrollTo with behavior "auto"/"smooth" would animate — the user then watches
  // the page visibly scroll up to the top ("page start poi scroll pani show"),
  // which reads as the glitch. We temporarily force `scroll-behavior: auto` on
  // <html> so the jump is truly instantaneous, then restore it. rAF runs after
  // React commits the new DOM (hero gone) and before paint, so there's no flash.
  const skipFirstScroll = useRef(true);
  useEffect(() => {
    if (skipFirstScroll.current) { skipFirstScroll.current = false; return; }
    requestAnimationFrame(() => {
      const el = document.documentElement;
      const prev = el.style.scrollBehavior;
      el.style.scrollBehavior = "auto"; // beat the global smooth-scroll
      window.scrollTo(0, 0);
      el.style.scrollBehavior = prev;
    });
  }, [activeCategoryId, debouncedQuery]);

  const goToPage = (p: number) => {
    setPage(p);
    fetchProducts(debouncedQuery, activeCategoryIdsParam, sortBy, p);
    // Jump to the START OF THE GRID so the next page's products are the first
    // thing the user sees. Use the always-mounted anchor (gridSectionRef) — the
    // grid itself is unmounted behind the loading skeleton, so gridTopRef would
    // be null here. requestAnimationFrame lets the loading re-render commit first.
    requestAnimationFrame(() =>
      (gridSectionRef.current ?? gridTopRef.current)?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };

  const handleClearAll = () => {
    setSortBy("alpha");
    setQuery("");
    router.push('/products/');
  };

  const gridClass = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4";

  // Showcase extras (scroll hero, phone mockups, spotlight, dock) appear only on
  // the plain catalogue view — never while searching or drilled into a category.
  const defaultView = !debouncedQuery && !activeCategoryId;

  return (
    <div className="min-h-screen bg-slate-50 font-sans pt-28">
      {mounted && defaultView && (
        <div id="catalogue-hero">
          <CatalogueScrollHero
            scatterImages={products.slice(0, 10).map((p) => p.imageUrl).filter((url): url is string => Boolean(url))}
          />
        </div>
      )}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pb-12">
        {/* Header — search-aware. There is intentionally no search box here:
            search lives only in the homepage hero and the navbar. On /products
            the navbar shows its search input, so a second box was redundant. */}
        <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            {debouncedQuery ? (
              <>
                <p className="text-sm font-semibold text-brand-dark uppercase tracking-wider">Search results</p>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
                  &ldquo;{debouncedQuery}&rdquo;
                </h1>
                <p className="text-slate-500 mt-2 tabular-nums min-h-[3rem] sm:min-h-[1.5rem]">
                  {totalCapped ? `${totalProductCount.toLocaleString()}+` : totalProductCount.toLocaleString()} matching products
                </p>
              </>
            ) : (
              <>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Product Catalog</h1>
                {/* tabular-nums: the count swings between 2 and 7 digits as you
                    move between categories, and proportional digits re-flow the
                    whole sentence on each change. Fixed-width digits keep the
                    following words still. min-h reserves the wrapped height so a
                    shorter count collapsing the line never drags the page up. */}
                <p className="text-slate-500 mt-2 tabular-nums min-h-[3rem] sm:min-h-[1.5rem]">
                  {totalProductCount.toLocaleString()} products from across our global sourcing network
                </p>
              </>
            )}
          </div>

          {/* Right-side quick action: jump to the Top Ranking page. */}
          {!debouncedQuery && (
            <div className="flex items-center gap-2.5">
              <QuickLinkPill href="/rankings/" icon="/top-1.jpg" label="Top Ranking" hoverTextClass="hover:text-amber-600" />
            </div>
          )}
        </div>

        {/* Search facets — Alibaba-style "narrow by category" rail derived from
            the actual result set, so a shopper can pivot into the exact
            category their query hit. Shown only while searching. */}
        {debouncedQuery && facets.length > 0 && (
          <div className="mb-6 liquid-glass-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Related categories</span>
              {activeCategoryId && (
                <button
                  onClick={() => goToCategory(null)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-3 h-3" /> Clear category
                </button>
              )}
            </div>
            {/* Single-line carousel — chips never wrap; arrows scroll on desktop,
                swipe on touch. */}
            <div className="relative">
              <button
                onClick={() => scrollFacets(-1)}
                className="hidden md:flex absolute -left-1.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-slate-200 text-slate-600 hover:text-brand-dark hover:ring-brand/40 transition-colors"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div ref={facetScrollRef} className="flex flex-nowrap gap-2 overflow-x-auto scrollbar-hide scroll-smooth md:px-7">
                {facets.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => goToCategory(f.id)}
                    className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                      activeCategoryId === f.id
                        ? "bg-brand text-white border-brand"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:border-brand/40 hover:text-brand-dark"
                    }`}
                  >
                    <span>{f.name}</span>
                    <span className={`text-[11px] font-bold ${activeCategoryId === f.id ? "text-white/80" : "text-slate-400"}`}>
                      {f.count.toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => scrollFacets(1)}
                className="hidden md:flex absolute -right-1.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-slate-200 text-slate-600 hover:text-brand-dark hover:ring-brand/40 transition-colors"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-8 flex flex-col gap-4">
          {!debouncedQuery && rootChips.length > 0 && (
            <div id="browse-categories" className="liquid-glass-card scroll-mt-28">
              {/* Breadcrumb trail — shows where you are in the tree and lets you
                  jump back up to any ancestor level. Sits as the card header,
                  only once you've drilled into a category. */}
              {categoryPath.length > 0 && (
                <div className="flex items-center gap-2 px-4 sm:px-5 py-2.5 border-b border-slate-100">
                  {/* One line that scrolls sideways rather than wrapping. A
                      wrapped trail puts chevrons at the start of new lines and
                      grows the header to three rows on a phone; a single
                      swipeable line is the standard mobile breadcrumb and keeps
                      the deepest (current) category adjacent to the Clear
                      control. min-w-0 lets the strip actually shrink inside the
                      flex row instead of pushing Clear off the edge. */}
                  <div ref={crumbScrollRef} className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto scrollbar-hide text-[13px] sm:text-sm">
                    <button
                      onClick={() => goToCategory(null)}
                      className="shrink-0 whitespace-nowrap font-bold text-slate-500 hover:text-brand-dark transition-colors"
                    >
                      All Categories
                    </button>
                    {categoryPath.map((seg, i) => {
                      const isLast = i === categoryPath.length - 1;
                      return (
                        <span key={seg.id} className="flex shrink-0 items-center gap-1">
                          <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-300 shrink-0" />
                          <button
                            onClick={() => goToCategory(seg.id)}
                            disabled={isLast}
                            className={`whitespace-nowrap font-bold transition-colors ${isLast ? "text-brand-dark cursor-default" : "text-slate-500 hover:text-brand-dark"}`}
                          >
                            {seg.name}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  {/* Outside the scroll strip so it stays pinned and reachable
                      no matter how deep the trail is. */}
                  <button
                    onClick={() => goToCategory(null)}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-600 shadow-sm hover:border-red-200 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" /> Clear
                  </button>
                </div>
              )}

              <div className="p-4 sm:p-5 flex flex-col gap-6">
                {/* Current level as a uniform, wrapping image-tile grid — no
                    horizontal scroll, columns line up across rows and fill the
                    width. Root → top categories; parent → its subcategories;
                    leaf → its siblings (active one highlighted). */}
                {levelOptions.items.length > 0 && (
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{levelOptions.label}:</span>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-7 gap-x-3 gap-y-6 mt-3">
                      {levelOptions.items.map((chip) => (
                        <CategoryTile
                          key={chip.id}
                          name={chip.name}
                          thumbnailUrl={chip.thumbnailUrl}
                          count={chip.count}
                          active={chip.id === levelOptions.activeId}
                          onClick={() => goToCategory(chip.id)}
                          className="w-full"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Popular subcategories — discovery shortcut, top level only. */}
                {!activeCategoryId && popularSubcategories.length > 0 && (
                  <div className="pt-5 border-t border-slate-100">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Popular Subcategories:</span>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-7 gap-x-3 gap-y-6 mt-3">
                      {popularSubcategories.map((chip) => (
                        <CategoryTile
                          key={`pop-${chip.id}`}
                          name={chip.name}
                          thumbnailUrl={chip.thumbnailUrl}
                          count={chip.count}
                          onClick={() => goToCategory(chip.id)}
                          className="w-full"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sort / Clear All Filters sits AFTER the category browser so it's
              directly above the product grid it acts on — the category card is
              tall enough that a control above it is well out of view by the time
              you reach the results. relative z-40: each glass card creates its own
              backdrop-filter stacking context, so this row has to be lifted or the
              open Sort dropdown renders behind the card. */}
          <div className="relative z-40 flex flex-wrap items-center gap-3 liquid-glass-card p-3 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Sort</span>
              <SortDropdown value={sortBy} onChange={setSortBy} />
            </div>

            <div className="h-6 w-px bg-slate-200 hidden sm:block mx-1"></div>

            <button
              onClick={handleClearAll}
              className="px-3 py-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors ml-auto sm:ml-0"
            >
              Clear All Filters
            </button>
          </div>
        </div>

        {/* Always-mounted anchor for paging scroll (see gridSectionRef). */}
        <div ref={gridSectionRef} className="scroll-mt-28" />

        {loading ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className={gridClass}>
            {[...Array(PAGE_SIZE / 2)].map((_, i) => (
              <div key={i} className="liquid-glass-card h-[300px] animate-pulse w-full">
                <div className="h-44 bg-slate-100 rounded-t-xl"></div>
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                  <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                  <div className="h-6 bg-slate-100 rounded w-full mt-4"></div>
                </div>
              </div>
            ))}
          </motion.div>
        ) : (
          <>
            {/* Grid header: scroll anchor + "Page N" indicator so it's obvious
                which page (and A–Z stretch) you're viewing. */}
            {products.length > 0 && (
              <div ref={gridTopRef} className="scroll-mt-28 mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-sm font-bold text-brand-dark">Page {page}</span>
                  {sortBy === "alpha" && (
                    <span className="text-sm font-semibold text-slate-500">
                      {products[0].name.trim()[0]?.toUpperCase()} – {products[products.length - 1].name.trim()[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium text-slate-400">of {totalPages.toLocaleString()} pages</span>
              </div>
            )}

            {/* Fade only — no y-offset. `key` changes on every category, search
                and page change, so the grid remounts and replays this on each
                one; a 14px slide meant the whole results area visibly jumped
                upward every single time you opened a category, which on a phone
                (where the grid fills the screen) read as the page shaking. */}
            <motion.div
              key={`${activeCategoryId ?? "root"}-${debouncedQuery}-${page}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className={gridClass}
            >
              {products.map((product, idx) => (
                <div key={product.id} className="w-full">
                  <ProductCard product={product} onClick={() => setInquiryProduct(product)} priority={idx < 12} />
                </div>
              ))}
            </motion.div>

            {error && (
              <div className="mt-8 p-4 bg-red-50 text-red-600 rounded-xl text-center border border-red-100">
                {error}
              </div>
            )}

            {!error && products.length === 0 && (
              <div className="mt-12 text-center text-slate-500 py-12 liquid-glass-card">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-lg font-medium text-slate-900">No products found</p>
                <p className="mt-1">Try adjusting your search or filters.</p>
              </div>
            )}

          </>
        )}

        {/* Pagination at the very bottom — paging updates the grid (above);
            clicking it scrolls back to the grid start so the new page leads. */}
        {!loading && products.length > 0 && (
          <div className="mt-8">
            <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
          </div>
        )}
      </div>
      <FooterSection />
      <CatalogueDock />
      <InquiryModal product={inquiryProduct} onClose={() => setInquiryProduct(null)} />
    </div>
  );
}
