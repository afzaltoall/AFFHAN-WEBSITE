"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Loader2, PackagePlus, RotateCcw, Search, SpellCheck, X } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import type { SupplierFamily } from "@/lib/supplier-catalogue";
import type { SupplierContact } from "@/lib/supplier-offer";
import { useIsPhone } from "@/lib/useIsPhone";
import { overlayEntryIsCurrent, useBackDismiss } from "@/lib/useBackDismiss";
import { SearchAssistPanel, usePanelFit, useSearchAssist, type AssistProduct } from "@/components/search/SearchAssist";
import type { SearchKit } from "@/components/search/searchKit";
import { ApplySheet, type ApplyTarget, type CatalogueProduct, type SentOffer } from "@/components/supplier/ApplySheet";
import { CategorySheet, CircleRow, FamilyTabs, Trail, largestKinds, placesOf } from "@/components/supplier/SupplierCategoryPicker";

/** Products per request: what the site's own catalogue asks for at a time. */
const PAGE = 40;
/** Cards whose pictures load at once: the first screen's worth (see ProductCard on lazy images and reloads). */
const EAGER = 12;
/** The empty search box's examples: things a factory makes, said the way it would search (no budgets, no quantities). */
const EXAMPLES = ["bluetooth earbuds", "cotton t-shirt", "led bulbs", "stainless steel water bottle", "phone case", "kids toys"] as const;

interface Scope {
  id: string;
  name: string;
  /** The family it belongs under, when it is in the portal's tree (lib/supplier-catalogue.ts). */
  familyId: string | null;
}

type Sort = "best" | "newest" | "oldest";
type Status = "loading" | "idle" | "end" | "error";

/** What /api/products said about how it read a search. */
interface SearchInfo {
  text: string;
  typed: string;
  corrected: boolean;
  loose: boolean;
  primary: Array<{ id: string; name: string; label?: string; total: number }>;
}

interface Chip {
  id: string;
  name: string;
  count: number;
  best: boolean;
}

/**
 * Runs `work` on the page's own history entry: at once, or, while an overlay's entry is current (Select
 * category, the phone's search: useBackDismiss), once closing it has popped that entry and the browser has
 * restored the scroll it kept there. Done any sooner, the pop takes a replaceState away with the entry, and the
 * restore undoes a scroll. Returns what stops the wait.
 */
function onPageEntry(work: () => void): () => void {
  if (!overlayEntryIsCurrent()) {
    work();
    return () => {};
  }
  let frame = 0;
  const popped = () => {
    frame = requestAnimationFrame(work);
  };
  window.addEventListener("popstate", popped, { once: true });
  return () => {
    window.removeEventListener("popstate", popped);
    cancelAnimationFrame(frame);
  };
}

/**
 * The supplier portal's catalogue (the owner, 2026-10-21 and -22): every product the site lists, to find the
 * ones a supplier makes and press "I have this".
 *
 * The whole width, as a marketplace's catalogue uses it ("everything feels centre", the owner): the families
 * down the left, the open one showing its categories, sticky while the products scroll; the search across the
 * top of the products; the grid filling what is left, as many columns as fit.
 *
 * Below 1024px, Alibaba's app ("make like alibaba style perfection select category", the owner, of the phone):
 * the search and the families' row held at the top as the page scrolls, the families' categories as round
 * pictures under them, Select category for the whole tree (SupplierCategoryPicker), and the list under a trail
 * back up. On a phone the search takes the whole screen while it is in use, as the shop's does.
 *
 * The search is the site's own, not a lesser copy ("very weak", the owner): the same engine as the shop's box
 * (useSearchAssist: completions as you type, the categories the words name, products with their pictures,
 * typos corrected, recent searches), the same ranking on the results (/api/products), and the shop's results
 * extras: "Showing results for…" with the way back to what was typed, the categories the search hit to narrow
 * by, and an order. A product picked from the suggestions opens its application straight away.
 */
export function SupplierCatalogue({
  families,
  total,
  applied: appliedFromServer,
  contact,
  initial,
  welcome,
  firstName,
}: {
  families: SupplierFamily[];
  /** Products in the catalogue, or null when the figure could not be read. */
  total: number | null;
  /** Open applications: product id to application id. */
  applied: Record<string, string>;
  contact: SupplierContact;
  initial: { q: string; scope: Scope | null; sort?: string; exact?: boolean };
  welcome: boolean;
  firstName: string;
}) {
  const router = useRouter();
  const isPhone = useIsPhone();
  const [typed, setTyped] = useState(initial.q);
  const [query, setQuery] = useState(initial.q);
  const [exact, setExact] = useState(Boolean(initial.exact));
  const [scope, setScope] = useState<Scope | null>(initial.scope);
  const [sort, setSort] = useState<Sort>(initial.sort === "newest" || initial.sort === "oldest" ? initial.sort : "best");
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const [found, setFound] = useState<{ total: number; capped: boolean } | null>(null);
  const [info, setInfo] = useState<SearchInfo | null>(null);
  const [facets, setFacets] = useState<Chip[]>([]);
  const [applied, setApplied] = useState(appliedFromServer);
  const [sheet, setSheet] = useState<ApplyTarget | null>(null);
  const [picking, setPicking] = useState(false);
  const [showWelcome, setShowWelcome] = useState(welcome);
  const [focused, setFocused] = useState(false);
  const generation = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // The top of the page below 1024px (the search and the families' row) and the first thing under it.
  const strip = useRef<HTMLDivElement>(null);
  const underStrip = useRef<HTMLDivElement>(null);
  // The search engine's newest category data and product suggestions, for the dropdown's callbacks, which are
  // made before the hook answers (kept up to date after each render, below).
  const assistKit = useRef<SearchKit | null>(null);
  const productsFromAssist = useRef<AssistProduct[]>([]);
  // Where the dropdown brings the box up to: under this portal's bar.
  const [barBottom, setBarBottom] = useState(76);
  // The category list down the left from 1024px, and its families inside it: the list scrolls on its own, and fades
  // at an edge where more of it goes on.
  const railList = useRef<HTMLElement>(null);
  const railItems = useRef<HTMLDivElement>(null);
  const [railFade, setRailFade] = useState({ top: false, bottom: false });

  // On a phone the search is the whole screen while it is in use.
  const phoneSearch = focused && isPhone;

  // The server's word on what is open, whenever it is read again (after an application, router.refresh()).
  useEffect(() => setApplied(appliedFromServer), [appliedFromServer]);

  const places = useMemo(() => placesOf(families), [families]);
  const largest = useMemo(() => largestKinds(families), [families]);
  const place = scope ? places.get(scope.id) : undefined;

  /** A category as the page holds it: its name and family from the portal's tree, when it is in it. */
  const scopeOf = useCallback(
    (id: string, name?: string): Scope => {
      const p = places.get(id);
      return { id, name: p?.name ?? name ?? "This category", familyId: p?.familyId ?? null };
    },
    [places],
  );

  // Below 1024px, a list newly picked starts at its top, just under the search and the families' row, wherever
  // the page had been scrolled to. From 1024px the card is not held at the top, and this finds nothing to do.
  const toResults = useCallback(() => {
    const top = strip.current;
    const mark = underStrip.current;
    if (!top || !mark) return;
    const target = Math.max(0, Math.round(mark.getBoundingClientRect().top + window.scrollY - top.getBoundingClientRect().bottom));
    if (window.scrollY > target + 1) window.scrollTo({ top: target, behavior: "instant" as ScrollBehavior });
  }, []);

  // ---- the search box: the site's own engine ---------------------------------------------------------------
  const runSearch = useCallback(
    (term: string) => {
      const text = term.trim();
      setTyped(text);
      setQuery(text);
      setExact(false);
      // A new search looks everywhere; the categories it hits are offered under it to narrow by.
      setScope(null);
      setSort("best");
      setFocused(false);
      input.current?.blur();
      onPageEntry(toResults);
    },
    [toResults],
  );

  // The phone's search put away without searching: the box says again what the list is of.
  const closeSearch = useCallback(() => {
    setFocused(false);
    setTyped(query);
    input.current?.blur();
  }, [query]);

  const assist = useSearchAssist({
    query: typed,
    open: focused,
    onSearch: runSearch,
    onCategory: (id) => {
      const kit = assistKit.current;
      const rec = kit?.byId.get(id);
      let next = scopeOf(id, rec?.displayLabel || rec?.name || undefined);
      if (!next.familyId) {
        // Not in the portal's tree as the server drew it: up the parents to the first that is.
        let up = rec;
        for (let i = 0; up?.parentId && i < 6 && !places.has(up.id); i++) up = kit?.byId.get(up.parentId) ?? undefined;
        next = { ...next, familyId: (up && places.get(up.id)?.familyId) ?? null };
      }
      setScope(next);
      setTyped("");
      setQuery("");
      setExact(false);
      setFocused(false);
      onPageEntry(toResults);
    },
    onProduct: (id) => {
      const p = productsFromAssist.current.find((x) => x.id === id);
      setFocused(false);
      if (p) setSheet({ kind: "catalogue", product: { id: p.id, name: p.name, imageUrl: p.imageUrl, category: p.category } });
    },
    onClose: isPhone ? closeSearch : () => setFocused(false),
    examples: EXAMPLES,
    recentKey: "supplierRecentSearches",
  });
  useEffect(() => {
    assistKit.current = assist.kit;
    productsFromAssist.current = assist.products;
  }, [assist.kit, assist.products]);
  useEffect(() => {
    const bar = document.querySelector("header");
    if (bar) setBarBottom(Math.round(bar.getBoundingClientRect().height) + 12);
  }, []);
  const panelHeight = usePanelFit(searchBox, focused && !isPhone, barBottom);

  // The phone's Back puts the whole-screen search away rather than leaving the page; the page under it stays put.
  useBackDismiss(phoneSearch, closeSearch);
  useEffect(() => {
    if (!phoneSearch) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [phoneSearch]);

  // The dropdown closes when the press lands anywhere else.
  useEffect(() => {
    if (!focused) return;
    const away = (e: PointerEvent) => {
      if (searchBox.current && !searchBox.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [focused]);

  // ---- the results -------------------------------------------------------------------------------------------
  const load = useCallback(
    async (pageNo: number, reset: boolean) => {
      const mine = reset ? ++generation.current : generation.current;
      setStatus("loading");
      if (reset) {
        setProducts([]);
        setFound(null);
      }
      const params = new URLSearchParams({ page: String(pageNo), limit: String(PAGE) });
      if (query) {
        params.set("q", query);
        params.set("getChips", "1");
        if (exact) params.set("exact", "1");
      }
      if (scope) params.set("categoryId", scope.id);
      if (sort !== "best") params.set("sortBy", sort);
      try {
        const res = await fetch(`/api/products/?${params}`);
        const data = await res.json();
        if (mine !== generation.current) return;
        if (!res.ok || !data?.success) throw new Error("products");
        const rows: CatalogueProduct[] = (data.data as Array<{
          id: number;
          name: string;
          imageUrl: string | null;
          category: string | null;
          categoryRef: { name: string | null } | null;
        }>).map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl, category: p.categoryRef?.name ?? p.category ?? null }));
        setProducts((before) => {
          const base = reset ? [] : before;
          const seen = new Set(base.map((p) => p.id));
          return [...base, ...rows.filter((r) => !seen.has(r.id) && Boolean(seen.add(r.id)))];
        });
        setPage(pageNo);
        if (pageNo === 1) {
          setFound({ total: data.pagination?.total ?? rows.length, capped: Boolean(data.pagination?.totalCapped) });
          setInfo(data.search ? (data.search as SearchInfo) : null);
          setFacets(
            (data.facets ?? []).map((f: { id: string; name: string; label?: string; count: number }) => ({
              id: f.id,
              name: f.label ?? f.name,
              count: Number(f.count) || 0,
              best: false,
            })),
          );
        }
        const pages = Number(data.pagination?.totalPages ?? 1);
        // With no search and no category, page 1 is the homepage's shuffled showcase (the daily refresh's stored
        // pool, which can be short, or missing before a refresh) and page 2 on is the whole catalogue in order;
        // so page 1 never ends the list, and an empty one simply moves on to page 2.
        const showcase = !query && !scope && pageNo === 1;
        setStatus(!showcase && (rows.length < PAGE || pageNo >= pages) ? "end" : "idle");
      } catch {
        if (mine === generation.current) setStatus("error");
      }
    },
    [query, scope, sort, exact],
  );

  // A new search, category or order starts the list again, from the top of the products.
  useEffect(() => {
    void load(1, true);
  }, [load]);

  // The next page when the end of the list comes near; again at once if the screen is still not full.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || status !== "idle") return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void load(page + 1, false);
    }, { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [status, page, load]);

  // The search, the category and the order into the address, so a reload or a link opens the same list.
  useEffect(
    () =>
      onPageEntry(() => {
        const p = new URLSearchParams();
        if (query) p.set("q", query);
        if (exact) p.set("exact", "1");
        if (scope) p.set("cat", scope.id);
        if (sort !== "best") p.set("sort", sort);
        const qs = p.toString();
        const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
        if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
      }),
    [query, scope, sort, exact],
  );

  // The welcome is for the arrival only: out of the address, so a reload does not say it again.
  useEffect(() => {
    if (!welcome) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("welcome")) {
      url.searchParams.delete("welcome");
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
  }, [welcome]);

  const choose = (next: Scope | null) => {
    setScope(next);
    if (!next || query) setSort("best");
  };

  // ---- the category list from 1024px -----------------------------------------------------------------------
  // On a laptop the families are taller than the screen. The list scrolls inside the rail with "Not in the
  // catalogue?" held under it (2026-10-26: the card had been the list's last item, cut off at the screen's foot,
  // and Edge drew a scrollbar with arrow buttons down the families). Its bar is a faint thumb (.rail-scroll),
  // and a fade at an edge says where more of the list goes on.
  const measureRail = useCallback(() => {
    const el = railList.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setRailFade((f) => (f.top === top && f.bottom === bottom ? f : { top, bottom }));
  }, []);
  useEffect(() => {
    const el = railList.current;
    const items = railItems.current;
    if (!el || !items) return;
    measureRail();
    // The window's height sizes the list; a family opening sizes what is in it.
    const ro = new ResizeObserver(measureRail);
    ro.observe(el);
    ro.observe(items);
    return () => ro.disconnect();
  }, [measureRail]);
  // A category picked from elsewhere (a search's chips, its suggestions, the address) is brought into the list's
  // view, clear of the fades; the window itself never moves for it.
  useEffect(() => {
    const el = railList.current;
    const picked = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !picked || el.scrollHeight <= el.clientHeight) return;
    const clear = 28;
    const r = picked.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    if (r.top < box.top + clear) el.scrollTop -= box.top + clear - r.top;
    else if (r.bottom > box.bottom - clear) el.scrollTop += r.bottom - (box.bottom - clear);
  }, [scope?.id]);
  const railMask =
    railFade.top || railFade.bottom
      ? `linear-gradient(to bottom, ${railFade.top ? "transparent 0, #000 22px" : "#000 0"}, ${railFade.bottom ? "#000 calc(100% - 30px), transparent 100%" : "#000 100%"})`
      : undefined;

  // A category picked below 1024px (the families' row, the pictures, Select category, the trail): its list,
  // from the top.
  const pick = (id: string | null) => {
    choose(id ? scopeOf(id, scope?.id === id ? scope.name : undefined) : null);
    onPageEntry(toResults);
  };

  const openPicker = useCallback(() => {
    setFocused(false);
    setPicking(true);
  }, []);
  const closePicker = useCallback(() => setPicking(false), []);

  const closeSheet = useCallback(() => setSheet(null), []);
  const onSent = useCallback(
    (offer: SentOffer) => {
      if (offer.productId !== null) setApplied((a) => ({ ...a, [String(offer.productId)]: offer.id }));
      // The bar's count of open applications is the layout's; read it again.
      router.refresh();
    },
    [router],
  );

  // The search's categories to narrow by: the ones its words name first, then the ones its matches sit in, no
  // category twice (the shop's rule, ProductsCatalogue).
  const chips = useMemo<Chip[]>(() => {
    if (!query) return [];
    const best = (info?.primary ?? []).map((p) => ({ id: p.id, name: p.label ?? p.name, count: p.total, best: true }));
    const seen = new Set(best.map((b) => b.id));
    return [...best, ...facets.filter((f) => !seen.has(f.id))];
  }, [query, info, facets]);

  // The round pictures under the families' row: what is under the category being looked at, the largest kinds
  // before one is picked; none for a kind, nor for a search, whose own categories come with its results.
  const circles = query ? [] : !scope ? largest : (place?.below ?? []);

  const count = (n: number) => n.toLocaleString("en-US");
  const shownWords = info?.corrected ? info.text : query;
  const heading = query ? (
    <>
      Results for <span className="text-brand-dark">“{shownWords}”</span>
      {scope ? <span className="text-[#5b6f76]"> in {scope.name}</span> : null}
    </>
  ) : scope ? (
    scope.name
  ) : (
    "Our catalogue"
  );
  const foundLine = found
    ? info?.loose
      ? "No product has every word. These come closest."
      : `${found.capped ? `${count(found.total)}+` : count(found.total)} ${found.total === 1 ? "product" : "products"}`
    : "";
  const sub =
    status === "loading" && !found
      ? "Finding products…"
      : query || scope
        ? foundLine
        : total
          ? // Said here once, as the shop says a list's size; not again in the search box above (the owner's rule).
            `${count(total)} products`
          : "Search by name, or pick a category.";
  // Below 1024px a category's size is in its heading, as the shop's category page has it; so the line under says
  // only what a search found, or, before anything is picked, what to do.
  const scopeSize = place?.count ?? found?.total ?? null;
  const phoneSub = query
    ? status === "loading" && !found
      ? "Finding products…"
      : foundLine
    : scope
      ? ""
      : "Tap “I have this” on anything your company makes or stocks.";

  const railButton = (active: boolean, nested = false) =>
    `group flex w-full items-center gap-2 rounded-xl text-left transition-colors ${nested ? "px-2.5 py-1.5 text-[13px]" : "px-3 py-2 text-[14px]"} ${
      active ? "bg-[#0b2230] font-semibold text-white" : `font-medium text-[#33494f] hover:bg-white hover:text-[#0b2230] ${nested ? "" : "hover:shadow-[0_1px_0_rgba(11,34,48,0.04)]"}`
    }`;
  const ownProduct = () => setSheet({ kind: "own", name: query || undefined });

  const sortSelect = (compact: boolean) => (
    <label className="flex shrink-0 items-center gap-2 text-[13px] font-semibold text-[#33494f]">
      <span className={compact ? "sr-only" : "text-[#6d8288]"}>Sort</span>
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as Sort)}
        className={
          compact
            ? "h-8 cursor-pointer rounded-full bg-white pl-3 pr-1.5 text-[12.5px] font-semibold text-slate-800 outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-brand/60"
            : "h-9 cursor-pointer rounded-xl bg-white px-3 text-[13px] font-semibold text-[#10262e] outline-none ring-1 ring-[#dbe4e7] focus:ring-2 focus:ring-brand/60"
        }
      >
        {query && <option value="best">Best match</option>}
        {!query && <option value="best">Newest first</option>}
        {query && <option value="newest">Newest first</option>}
        <option value="oldest">Oldest first</option>
      </select>
    </label>
  );

  const welcomeNote = (className: string) => (
    <div className={`items-start gap-3 rounded-2xl bg-emerald-50 px-4 py-3.5 ring-1 ring-emerald-200/70 ${className}`}>
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
      <p className="flex-1 text-[13.5px] leading-relaxed text-emerald-900">
        <span className="font-bold">Welcome, {firstName}. Your supplier account is ready.</span> Find a product your company makes or stocks,
        and press <span className="font-semibold">I have this</span>.
      </p>
      <button type="button" onClick={() => setShowWelcome(false)} aria-label="Dismiss" className="rounded-full p-1 text-emerald-700 hover:bg-emerald-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <main className="px-4 pb-16 sm:px-6 lg:px-8 lg:pt-7">
      <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[280px_minmax(0,1fr)] xl:gap-10">
        {/* The families, down the left from lg: sticky under the bar while the products scroll. */}
        <aside className="hidden lg:block" aria-label="Categories">
          {/* No taller than the screen under the bar, 20px clear of its foot as it is of the bar: the families
              scroll inside, and the card under them stays whole. */}
          <div className="sticky top-[76px] flex max-h-[calc(100dvh-96px)] flex-col">
            <p className="shrink-0 px-3 pb-2 text-[15px] font-extrabold tracking-tight text-[#0b2230]">Categories</p>
            <nav
              ref={railList}
              onScroll={measureRail}
              style={railMask ? { maskImage: railMask, WebkitMaskImage: railMask } : undefined}
              className="rail-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
            >
              <div ref={railItems} className="space-y-0.5">
                <button type="button" onClick={() => choose(null)} aria-pressed={!scope} className={railButton(!scope)}>
                  All products
                </button>
                {families.map((f) => {
                  const openFamily = scope?.familyId === f.id;
                  return (
                    <div key={f.id}>
                      <button
                        type="button"
                        onClick={() => choose({ id: f.id, name: f.name, familyId: f.id })}
                        aria-pressed={scope?.id === f.id}
                        aria-expanded={openFamily}
                        className={railButton(scope?.id === f.id)}
                      >
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        {f.children.length > 0 && (
                          <ChevronRight
                            className={`h-4 w-4 shrink-0 transition-transform ${openFamily ? "rotate-90" : ""} ${scope?.id === f.id ? "text-white/70" : "text-[#9aabb0]"}`}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                      {openFamily && f.children.length > 0 && (
                        <div className="my-1 ml-4 space-y-0.5 border-l border-[#d5e0e3] pl-2">
                          {f.children.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => choose({ id: c.id, name: c.name, familyId: f.id })}
                              aria-pressed={scope?.id === c.id}
                              className={railButton(scope?.id === c.id, true)}
                            >
                              <span className="min-w-0 flex-1 truncate">{c.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </nav>
            {/* Its right edge on the families' own: the list's 4px and its 6px gutter, kept whether or not it scrolls. */}
            <div className="mr-2.5 mt-3 shrink-0 rounded-2xl bg-white p-3.5 ring-1 ring-[#e1e8ea]">
              <p className="flex items-center gap-2 text-[13.5px] font-bold text-[#0b2230]">
                <PackagePlus className="h-[18px] w-[18px] shrink-0 text-brand-dark" aria-hidden="true" />
                Not in the catalogue?
              </p>
              <p className="mt-1 text-[12.5px] leading-snug text-[#5b6f76]">Apply with a product of your own, and the team looks at it like any other.</p>
              <button type="button" onClick={ownProduct} className="mt-2.5 w-full rounded-xl bg-[#0b2230] px-3 py-2 text-[12.5px] font-bold text-white hover:bg-[#143547]">
                Apply with your own product
              </button>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          {showWelcome && welcomeNote("mb-5 hidden lg:flex")}

          {/* The search. Below 1024px the top of the page, held there as the page scrolls (under the bar from 768px,
              where the bar is held too), with the families' row under it; from 1024px, the card at the head of the
              products. */}
          <div
            ref={strip}
            className="sticky top-0 z-[45] -mx-4 border-b border-slate-200/70 bg-white sm:-mx-6 md:top-14 lg:static lg:z-auto lg:mx-0 lg:rounded-[22px] lg:border-0 lg:px-7 lg:py-6 lg:ring-1 lg:ring-[#e1e8ea]"
          >
            <h1 className="hidden text-[26px] font-extrabold tracking-tight text-[#0b2230] lg:block">Which of these can you supply?</h1>
            <p className="mt-1 hidden text-[14px] leading-relaxed text-[#4b6168] lg:block">
              Press <span className="font-semibold text-[#0b2230]">I have this</span> on any product your company makes or stocks, and tell us
              your minimum order. Our sourcing team reviews every application.
            </p>

            {/* Keeps the strip's height while, on a phone, the search is the whole screen. */}
            <div className="h-14 px-4 py-2 sm:px-6 lg:mt-4 lg:h-auto lg:p-0">
              <div ref={searchBox} className={phoneSearch ? "pc-sheet fixed inset-0 z-[150] flex flex-col bg-white" : "relative z-30"}>
                <form
                  role="search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (typed.trim()) {
                      assist.saveRecent(typed);
                      runSearch(typed);
                    }
                  }}
                  className={phoneSearch ? "flex h-14 shrink-0 items-center gap-1.5 border-b border-slate-100 pl-3 pr-1" : "flex items-center"}
                >
                  <div
                    className={`flex h-10 min-w-0 flex-1 items-center gap-1 rounded-full pl-3.5 pr-1 transition-shadow lg:h-auto lg:gap-2 lg:rounded-2xl lg:p-1.5 ${
                      focused
                        ? "bg-slate-100 ring-2 ring-brand/40 lg:bg-white lg:ring-brand/60 lg:shadow-[0_8px_24px_rgba(11,34,48,0.08)]"
                        : "bg-slate-100 ring-1 ring-slate-200/80 lg:bg-[#f2f6f7] lg:ring-[#d9e3e6]"
                    }`}
                  >
                    <Search
                      className={`h-[17px] w-[17px] shrink-0 lg:ml-2.5 lg:h-5 lg:w-5 ${focused ? "text-brand" : "text-slate-500 lg:text-[#6d8288]"}`}
                      aria-hidden="true"
                    />
                    <input
                      ref={input}
                      {...assist.inputProps}
                      type="text"
                      inputMode="search"
                      enterKeyHint="search"
                      autoComplete="off"
                      value={typed}
                      onChange={(e) => {
                        setTyped(e.target.value);
                        setFocused(true);
                      }}
                      onFocus={() => setFocused(true)}
                      // The catalogue's size is said once, under the search. A phone's box holds two words: the
                      // examples were cut mid-word there ("like “bluet"), and its search lists them when opened.
                      placeholder={isPhone ? "Search products" : "Search products, like “bluetooth earbuds” or “cotton t-shirt”"}
                      aria-label="Search the catalogue"
                      className="h-full min-w-0 flex-1 bg-transparent pl-1 text-[15px] text-[#10262e] outline-none placeholder:text-slate-500 lg:py-2 lg:pl-0 lg:placeholder:text-[#8a9ba0]"
                    />
                    {typed && (
                      <button
                        type="button"
                        onClick={() => {
                          setTyped("");
                          if (query) setQuery("");
                          input.current?.focus();
                        }}
                        aria-label="Clear the search"
                        className="grid size-7 shrink-0 place-items-center rounded-full text-slate-500 active:bg-black/5 lg:size-auto lg:p-1.5 lg:text-[#6d8288] lg:hover:bg-[#e6eef0]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="submit"
                      aria-label="Search"
                      className="grid h-8 w-11 shrink-0 place-items-center rounded-full bg-brand-dark text-white transition-colors active:bg-brand-deep lg:h-auto lg:w-auto lg:rounded-xl lg:px-7 lg:py-2.5 lg:text-[14px] lg:font-bold lg:hover:bg-brand-deep"
                    >
                      <Search size={17} strokeWidth={2.4} className="lg:hidden" aria-hidden="true" />
                      <span className="hidden lg:inline">Search</span>
                    </button>
                  </div>
                  {phoneSearch && (
                    <button type="button" onClick={closeSearch} className="shrink-0 px-2.5 py-2 text-[15px] font-medium text-slate-700 active:text-slate-950">
                      Cancel
                    </button>
                  )}
                </form>

                {focused && (
                  <div
                    style={phoneSearch ? undefined : { maxHeight: panelHeight }}
                    className={
                      phoneSearch
                        ? "min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-8 pt-3"
                        : "absolute inset-x-0 top-[calc(100%+8px)] z-30 max-h-[72dvh] overflow-y-auto overscroll-contain rounded-2xl border border-slate-100 bg-white p-3 shadow-2xl sm:p-3.5"
                    }
                  >
                    <SearchAssistPanel
                      assist={assist}
                      query={typed}
                      examplesTitle="Try searching for"
                      onFill={(text) => {
                        setTyped(text);
                        input.current?.focus();
                      }}
                      footer={
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setFocused(false);
                            setSheet({ kind: "own", name: typed.trim() || undefined });
                          }}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12.5px] font-semibold text-brand-dark hover:bg-brand/5"
                        >
                          <PackagePlus size={14} aria-hidden="true" />
                          Not listed? Apply with your own product
                          <ChevronRight size={14} aria-hidden="true" />
                        </button>
                      }
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="lg:hidden">
              <FamilyTabs families={families} picked={scope ? (scope.familyId ?? "") : null} onPick={pick} onOpenAll={openPicker} />
            </div>
          </div>
          <div ref={underStrip} aria-hidden="true" />

          {/* Below 1024px, what is under the category being looked at, as round pictures. */}
          {circles.length > 0 && (
            <div className="-mx-4 border-b border-slate-200/70 bg-white px-4 pb-4 pt-3.5 sm:-mx-6 sm:px-6 lg:hidden">
              <CircleRow
                label={scope ? `Categories in ${scope.name}` : "Categories"}
                items={circles}
                current={scope?.id ?? null}
                onPick={pick}
                onOpenAll={openPicker}
              />
            </div>
          )}

          {showWelcome && welcomeNote("mt-3 flex lg:hidden")}

          {/* Below 1024px: the trail back up, the list's name (a category's with its size, as the shop's category
              page), and its order. */}
          <div className="mt-4 lg:hidden">
            {scope && <Trail path={place?.path ?? [{ id: scope.id, name: scope.name }]} onPick={pick} />}
            <div className={`flex items-start justify-between gap-3 ${scope ? "mt-1.5" : ""}`}>
              {query ? (
                <h2 className="min-w-0 text-[18px] font-bold leading-snug text-slate-900">
                  Results for <span className="text-brand-dark">“{shownWords}”</span>
                </h2>
              ) : scope ? (
                <h2 className="min-w-0 text-[19px] font-bold leading-tight text-slate-900 [text-wrap:balance]">
                  {scope.name}{" "}
                  {scopeSize !== null && <span className="whitespace-nowrap text-[14px] font-semibold tabular-nums text-slate-500">({count(scopeSize)})</span>}
                </h2>
              ) : (
                <h1 className="min-w-0 text-[19px] font-bold leading-tight text-slate-900">Which of these can you supply?</h1>
              )}
              {(query || scope) && sortSelect(true)}
            </div>
            {phoneSub && <p className="mt-1 text-[12.5px] leading-snug tabular-nums text-slate-500">{phoneSub}</p>}
            {!query && !scope && (
              <button
                type="button"
                onClick={ownProduct}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-brand-dark ring-1 ring-[#cfdcdf] active:bg-[#f2f8f9]"
              >
                <PackagePlus className="h-4 w-4" aria-hidden="true" />
                Not listed? Apply with your own product
              </button>
            )}
          </div>

          <div className="mt-6 hidden flex-wrap items-end justify-between gap-x-4 gap-y-3 lg:flex">
            <div className="min-w-0">
              <h2 className="text-[18px] font-bold tracking-tight text-[#0b2230]">{heading}</h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-[#5b6f76]">
                <span className="tabular-nums">{sub}</span>
                {scope && (
                  <button
                    type="button"
                    onClick={() => choose(null)}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[12px] font-semibold text-[#33494f] ring-1 ring-[#dbe4e7] hover:ring-brand/60"
                  >
                    {query ? "Search every category" : "All products"} <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </p>
            </div>
            {(query || scope) && sortSelect(false)}
          </div>

          {query && info?.corrected && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-[#5b6f76]">
              <SpellCheck className="h-4 w-4 text-brand" aria-hidden="true" />
              Showing results for <span className="font-semibold text-[#10262e]">{info.text}</span>.
              <button type="button" onClick={() => setExact(true)} className="font-semibold text-brand-dark underline-offset-2 hover:underline">
                Search for “{info.typed || query}” instead
              </button>
            </p>
          )}

          {/* The categories this search hit, to narrow by: the ones its words name first, with their sizes. */}
          {chips.length > 0 && (
            <div className="mt-4 rounded-2xl bg-white px-3.5 py-3 ring-1 ring-[#e1e8ea]">
              <p className="px-0.5 pb-2 text-[12.5px] font-semibold text-[#5b6f76]">
                {chips[0]?.best ? "Best match, and related categories" : "Related categories"}
              </p>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]">
                {chips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => choose(scope?.id === c.id ? null : scopeOf(c.id, c.name))}
                    aria-pressed={scope?.id === c.id}
                    className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                      scope?.id === c.id
                        ? "border-[#0b2230] bg-[#0b2230] text-white"
                        : c.best
                          ? "border-brand/40 bg-brand/[0.07] text-brand-dark hover:bg-brand/10"
                          : "border-[#dbe4e7] bg-[#f6f9fa] text-[#33494f] hover:border-brand/40 hover:text-brand-dark"
                    }`}
                  >
                    {c.name}
                    <span className={`text-[11px] font-bold tabular-nums ${scope?.id === c.id ? "text-white/75" : "text-[#8a9ba0]"}`}>{count(c.count)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(196px,1fr))]">
            {products.map((p, i) => (
              <ProductTile key={p.id} product={p} eager={i < EAGER} offerId={applied[String(p.id)]} onApply={() => setSheet({ kind: "catalogue", product: p })} />
            ))}
            {status === "loading" &&
              Array.from({ length: products.length ? 6 : 12 }, (_, i) => (
                <div key={`s${i}`} aria-hidden="true" className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e7eef0]">
                  <div className="aspect-square animate-pulse bg-[#eef3f4]" />
                  <div className="space-y-2 p-3">
                    <div className="h-2.5 w-1/2 animate-pulse rounded bg-[#eef3f4]" />
                    <div className="h-3 w-full animate-pulse rounded bg-[#eef3f4]" />
                    <div className="h-8 w-full animate-pulse rounded-xl bg-[#eef3f4]" />
                  </div>
                </div>
              ))}
          </div>

          {status === "error" && (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-[#e1e8ea]">
              <p className="text-[14px] font-semibold">The products could not be loaded.</p>
              <button
                type="button"
                onClick={() => void load(products.length ? page + 1 : 1, !products.length)}
                className="inline-flex items-center gap-2 rounded-full bg-brand-dark px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-deep"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Try again
              </button>
            </div>
          )}

          {status === "end" && products.length === 0 && (
            <div className="mt-2 flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-[#e1e8ea]">
              <p className="text-[15px] font-semibold">
                {query ? `Nothing in the catalogue matches “${query}”${scope ? ` in ${scope.name}` : ""}.` : "No products here yet."}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {query && scope && (
                  <button type="button" onClick={() => choose(null)} className="rounded-full px-4 py-2 text-[13px] font-semibold text-brand-dark ring-1 ring-[#cfdcdf] hover:bg-[#f2f8f9]">
                    Search every category
                  </button>
                )}
                <button
                  type="button"
                  onClick={ownProduct}
                  className="inline-flex items-center gap-2 rounded-full bg-brand-dark px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-deep"
                >
                  <PackagePlus className="h-4 w-4" aria-hidden="true" /> Apply with your own product
                </button>
              </div>
            </div>
          )}

          <div ref={sentinel} aria-hidden="true" className="h-px" />
          {status === "loading" && products.length > 0 && (
            <p className="mt-4 flex items-center justify-center gap-2 text-[13px] text-[#5b6f76]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading more products…
            </p>
          )}
          {status === "end" && products.length > 0 && (
            <p className="mt-8 text-center text-[13px] text-[#5b6f76]">
              {query || scope ? "That's every product here. " : ""}
              Can&apos;t see yours?{" "}
              <button type="button" onClick={ownProduct} className="font-semibold text-brand-dark hover:underline">
                Apply with your own product
              </button>
              .
            </p>
          )}
        </section>
      </div>

      {sheet && <ApplySheet target={sheet} contact={contact} onClose={closeSheet} onSent={onSent} />}
      {picking && (
        <CategorySheet
          families={families}
          largest={largest}
          total={total}
          current={scope?.id ?? null}
          currentFamily={scope?.familyId ?? null}
          onPick={(id) => {
            setPicking(false);
            pick(id);
          }}
          onClose={closePicker}
        />
      )}
    </main>
  );
}

function ProductTile({
  product,
  eager,
  offerId,
  onApply,
}: {
  product: CatalogueProduct;
  eager: boolean;
  offerId: string | undefined;
  onApply: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const src = getCdnUrl(product.imageUrl, 400);
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-[#e1e8ea] transition-shadow hover:shadow-[0_10px_28px_rgba(11,34,48,0.10)] hover:ring-[#c9dade]">
      <button type="button" onClick={onApply} className="relative block aspect-square overflow-hidden bg-[#f4f7f8]" aria-label={`Apply to supply ${product.name}`}>
        {src && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            srcSet={[200, 260, 340, 400].map((w) => `${getCdnUrl(product.imageUrl, w)} ${w}w`).join(", ")}
            sizes="(max-width: 639px) 46vw, 240px"
            alt=""
            width={400}
            height={400}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-[12px] text-[#9aabb0]">No picture</span>
        )}
        {offerId && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Applied
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col p-3">
        {product.category && <p className="truncate text-[11.5px] font-medium text-[#6d8288]">{product.category}</p>}
        <h3 className="mt-0.5 line-clamp-2 min-h-[2.6em] text-[13px] font-semibold leading-[1.3] text-[#10262e]">{product.name}</h3>
        {offerId ? (
          <Link
            href={`/supplier/applications/#${offerId}`}
            className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-[12.5px] font-bold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
          >
            View application
          </Link>
        ) : (
          <button
            type="button"
            onClick={onApply}
            className="mt-3 rounded-xl bg-white px-3 py-2 text-[12.5px] font-bold text-brand-dark ring-1 ring-[#bcd3d9] transition-colors group-hover:bg-brand-dark group-hover:text-white group-hover:ring-brand-dark"
          >
            I have this
          </button>
        )}
      </div>
    </article>
  );
}
