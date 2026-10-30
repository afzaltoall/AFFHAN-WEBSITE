"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Layers, LayoutGrid, Loader2, PackagePlus, RotateCcw, Search, SpellCheck, X } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import type { RailEntry, SupplierFamily } from "@/lib/supplier-catalogue";
import type { SupplierContact } from "@/lib/supplier-offer";
import { useIsPhone } from "@/lib/useIsPhone";
import { overlayEntryIsCurrent, useBackDismiss } from "@/lib/useBackDismiss";
import { SearchAssistPanel, usePanelFit, useSearchAssist, type AssistProduct } from "@/components/search/SearchAssist";
import type { SearchKit } from "@/components/search/searchKit";
import { ApplySheet, type ApplyTarget, type CatalogueProduct, type SentOffer } from "@/components/supplier/ApplySheet";
import { CategorySheet, CircleRow, FamilyTabs, GridTile, Tile, Trail, largestKinds, placesOf } from "@/components/supplier/SupplierCategoryPicker";

/** Products per request: what the site's own catalogue asks for at a time. */
const PAGE = 40;
/** Cards whose pictures load at once: the first screen's worth (see ProductCard on lazy images and reloads). */
const EAGER = 12;
/** The empty search box's examples: things a factory makes, said the way it would search (no budgets, no quantities). */
const EXAMPLES = ["bluetooth earbuds", "cotton t-shirt", "led bulbs", "stainless steel water bottle", "phone case", "kids toys"] as const;
/** How long the pointer rests on a category before its list is read ahead: one passing over on its way reads nothing. */
const REST_MS = 100;
/** Lists whose pages are kept: the one shown, and the last few read ahead or shown before. */
const KEPT_LISTS = 12;

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

/** One page of the list as /api/products answered it. */
interface PageData {
  rows: CatalogueProduct[];
  total: number;
  capped: boolean;
  pages: number;
  search: SearchInfo | null;
  facets: Chip[];
}

/** What makes a list: its search (read exactly, or not), its category and its order. */
interface ListSpec {
  q: string;
  exact: boolean;
  scopeId: string;
  sort: Sort;
}
const keyOf = (list: ListSpec) => JSON.stringify([list.q, list.exact, list.scopeId, list.sort]);

/** A list's pages: those on their way, and those read. */
interface ListPages {
  pending: Map<number, Promise<PageData>>;
  ready: Map<number, PageData>;
}

/**
 * One picture width for every card, whatever the screen (2026-10-26). The image resizer makes a product's picture
 * the first time it is asked for, which took 2-3 s, and the catalogue's million are mostly never asked for; at one
 * width it is made once for every supplier, and the warm-up below fetches exactly what the card will show. 400px
 * fills a 250px card at 1.5x and a phone's half-width card at 2x.
 */
const TILE_WIDTH = 400;
const tileSrc = (imageUrl: string | null) => getCdnUrl(imageUrl, TILE_WIDTH);

/** Pictures fetched at once ahead of their cards: forty at once, the resizer failed a third after ten seconds. */
const WARM_AT_ONCE = 4;
/** For a list about to be picked: the first row's worth at once, as the press may come any moment. */
const WARM_AHEAD_AT_ONCE = 6;

/**
 * A page's pictures, fetched before its cards are drawn (at low priority), so the cards find them in the cache;
 * `atOnce` at a time, each next one only while `still()` holds.
 */
function warmPictures(rows: CatalogueProduct[], still: () => boolean = () => true, atOnce = WARM_AT_ONCE) {
  const urls = rows.map((r) => tileSrc(r.imageUrl)).filter((u): u is string => Boolean(u));
  let next = 0;
  const one = () => {
    const url = urls[next++];
    if (!url || !still()) return;
    const img = new Image();
    img.fetchPriority = "low";
    img.onload = img.onerror = one;
    img.src = url;
  };
  for (let i = 0; i < atOnce; i++) one();
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
 * down the left, the open one showing its categories, going up with the page as an Alibaba listing's do; the
 * search across the top of the products; the grid filling what is left, as many columns as fit. Its type is
 * Alibaba's (Roboto, set by the portal's layout), near-black and bold where it leads (2026-10-26).
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
  rail,
  total,
  applied: appliedFromServer,
  contact,
  initial,
  welcome,
  firstName,
}: {
  families: SupplierFamily[];
  /** The list down the left from 1024px: the shop's All Categories (supplierRail). */
  rail: RailEntry[];
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
  // Each page is read once and kept with its list (its search, category and order), and the page after the one
  // shown is read as soon as that is shown, its pictures fetched with it, so scrolling down meets products and
  // pictures already there (2026-10-26, "products loading late and sometimes not showing": a page took 0.4-1 s to
  // read, and a picture the resizer had not made before 2-3 s). The last few lists are kept, not only the one shown,
  // so a list read ahead from the categories (lookAhead, below) is there when it is picked, and one shown before is
  // there again at once.
  const spec = useMemo<ListSpec>(() => ({ q: query, exact, scopeId: scope?.id ?? "", sort }), [query, exact, scope?.id, sort]);
  const listKey = keyOf(spec);
  const lists = useRef(new Map<string, ListPages>());
  // The list shown, which making room for others never lets go, and the one last read ahead (lookAhead).
  const shownKey = useRef("");
  const aheadKey = useRef("");

  const readPage = useCallback((list: ListSpec, pageNo: number): Promise<PageData> => {
    const key = keyOf(list);
    const kept = lists.current;
    const pagesOf: ListPages = kept.get(key) ?? { pending: new Map(), ready: new Map() };
    // The list used last goes to the end; beyond the few kept, those used longest ago make room.
    kept.delete(key);
    kept.set(key, pagesOf);
    for (const old of kept.keys()) {
      if (kept.size <= KEPT_LISTS) break;
      if (old !== key && old !== shownKey.current) kept.delete(old);
    }
    const known = pagesOf.pending.get(pageNo);
    if (known) return known;
    const params = new URLSearchParams({ page: String(pageNo), limit: String(PAGE) });
    if (list.q) {
      params.set("q", list.q);
      params.set("getChips", "1");
      if (list.exact) params.set("exact", "1");
    }
    if (list.scopeId) params.set("categoryId", list.scopeId);
    if (list.sort !== "best") params.set("sortBy", list.sort);
    // This list's own maps: an answer that comes after another list is shown lands in them, not in that one's.
    const { pending, ready } = pagesOf;
    const work = (async () => {
      const res = await fetch(`/api/products/?${params}`);
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error("products");
      const rows: CatalogueProduct[] = (data.data as Array<{
        id: number;
        name: string;
        imageUrl: string | null;
        category: string | null;
        categoryRef: { name: string | null } | null;
      }>).map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl, category: p.categoryRef?.name ?? p.category ?? null }));
      const page: PageData = {
        rows,
        total: data.pagination?.total ?? rows.length,
        capped: Boolean(data.pagination?.totalCapped),
        pages: Number(data.pagination?.totalPages ?? 1),
        search: data.search ? (data.search as SearchInfo) : null,
        facets: (data.facets ?? []).map((f: { id: string; name: string; label?: string; count: number }) => ({
          id: f.id,
          name: f.label ?? f.name,
          count: Number(f.count) || 0,
          best: false,
        })),
      };
      ready.set(pageNo, page);
      return page;
    })();
    // A page that could not be read is asked for again the next time.
    work.catch(() => pending.delete(pageNo));
    pending.set(pageNo, work);
    return work;
  }, []);
  const read = useCallback((pageNo: number) => readPage(spec, pageNo), [readPage, spec]);

  const load = useCallback(
    async (pageNo: number, reset: boolean) => {
      const mine = reset ? ++generation.current : generation.current;
      if (reset) {
        setProducts([]);
        setFound(null);
      }
      // A page read ahead goes straight on; only one still on its way shows the loading cards.
      const ahead = lists.current.get(listKey)?.ready.get(pageNo);
      if (!ahead) setStatus("loading");
      try {
        const data = ahead ?? (await read(pageNo));
        if (mine !== generation.current) return;
        setProducts((before) => {
          const base = reset ? [] : before;
          const seen = new Set(base.map((p) => p.id));
          return [...base, ...data.rows.filter((r) => !seen.has(r.id) && Boolean(seen.add(r.id)))];
        });
        setPage(pageNo);
        if (pageNo === 1) {
          setFound({ total: data.total, capped: data.capped });
          setInfo(data.search);
          setFacets(data.facets);
        }
        // With no search and no category, page 1 is the homepage's shuffled showcase (the daily refresh's stored
        // pool, which can be short, or missing before a refresh) and page 2 on is the whole catalogue in order;
        // so page 1 never ends the list, and an empty one simply moves on to page 2.
        const showcase = !spec.q && !spec.scopeId && pageNo === 1;
        const more = showcase || (data.rows.length >= PAGE && pageNo < data.pages);
        setStatus(more ? "idle" : "end");
        if (more) void read(pageNo + 1).then((next) => warmPictures(next.rows)).catch(() => {});
      } catch {
        if (mine === generation.current) setStatus("error");
      }
    },
    [listKey, read, spec],
  );

  // A new search, category or order starts the list again, from the top of the products: before the screen is
  // drawn, so the list's name and its products change in the same frame (and a list read ahead is in it whole).
  useLayoutEffect(() => {
    shownKey.current = listKey;
    // Its cards fetch their own pictures now; any list may be read ahead again, one shown before as well.
    aheadKey.current = "";
    void load(1, true);
  }, [listKey, load]);

  // The next page when the end of the list comes near (two screens ahead); again at once if the screen is still
  // not full.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || status !== "idle") return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void load(page + 1, false);
    }, { rootMargin: "1600px 0px" });
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

  /** The list becomes `next`'s products (a search stays, narrowed to it). False when that is the list shown. */
  const choose = (next: Scope | null) => {
    if ((next?.id ?? null) === (scope?.id ?? null)) return false;
    setScope(next);
    if (!next || query) setSort("best");
    return true;
  };

  // ---- the categories from 1024px ---------------------------------------------------------------------------
  // Down the left, the shop's own All Categories as the navbar's panel lists it (the owner, 2026-10-29: "from this
  // all catgeories from navbar this full set ... have to show in ... supplier catgroies"): the families and the
  // categories the site lifts beside them (supplierRail), with the navbar's icons, rows and scroll. The list is held
  // in place as the products scroll (2026-10-26: "while scrolling side bar have to be in fixed") and covers the left
  // side from the top to the bottom (2026-10-29: "left side contents fulla left side cover panra maari"), scrolling
  // inside itself for the fifty, as the navbar's does. A row shows its products, and what is under it shows at the
  // top of them as round pictures, in the page: no panel over the products (the same day, of the panel beside the
  // list: "side popup maari kaata vendam ... right side la mela katanum", as Alibaba's category pages have it). That
  // panel had made the products behind it change as one family after another was looked through ("the background
  // products are changing"); now the products are always those the pictures above them belong to.
  //
  // A list picked here starts at the top of the page, as a new page opens; the one shown, picked again, stays
  // where it is.
  const chooseFromRail = (next: Scope | null) => {
    if (choose(next) && window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  };

  // The row marked in the list: the one the supplier came in by, while what is shown is inside it; otherwise the
  // deepest row what is shown is inside (Earrings rather than Jewelry & Watches); All products for everything.
  const [railFrom, setRailFrom] = useState<string | null>(null);
  const railIds = useMemo(() => new Set(rail.map((e) => e.id)), [rail]);
  const railOn = (() => {
    if (!scope) return "";
    const path = place?.path.map((p) => p.id) ?? [scope.id];
    if (railFrom && path.includes(railFrom)) return railFrom;
    return [...path].reverse().find((id) => railIds.has(id)) ?? scope.familyId ?? "";
  })();
  // The marked row brought into the list's view when it is out of it (picked from the pictures, a search or a
  // link): the list scrolls, never the page; at once as the page opens, smoothly after.
  const railNav = useRef<HTMLElement>(null);
  const railSeen = useRef(false);
  useEffect(() => {
    const nav = railNav.current;
    const row = nav?.querySelector<HTMLElement>(`[data-rail="${CSS.escape(railOn)}"]`);
    const first = !railSeen.current;
    railSeen.current = true;
    if (!nav || !row) return;
    const top = row.offsetTop;
    if (top >= nav.scrollTop && top + row.offsetHeight <= nav.scrollTop + nav.clientHeight) return;
    nav.scrollTo({ top: Math.max(0, top - (nav.clientHeight - row.offsetHeight) / 2), behavior: (first ? "instant" : "smooth") as ScrollBehavior });
  }, [railOn]);

  // The round pictures over the products: what is under the category shown (a family's categories, a category's
  // kinds), or for a kind, the kinds beside it; View all first, for the category they are all under. None for every
  // product, the families being down the left, nor for a search, whose own categories come with its results.
  const row = (() => {
    if (query || !place) return null;
    const parent = place.below.length > 0 ? place : place.path.length > 1 ? places.get(place.path[place.path.length - 2].id) : undefined;
    return parent && parent.below.length > 0 ? parent : null;
  })();

  // What a pick from the categories would show, read while the pointer rests on it (or while it is pressed, or the
  // keyboard is on it), the first row's pictures with it, so the press finds the list ready ("very slow", the same
  // day: the products were only asked for on the press, and every picture after them); and the round pictures it
  // will show over them. The pictures of a list looked at before it stop when the pointer moves on to another. What
  // each one picks is on it: data-ahead, a category's id ("" for every product).
  const resting = useRef(0);
  const roundPictures = useRef(new Set<string>());
  useEffect(() => () => window.clearTimeout(resting.current), []);
  const lookAhead = (id: string | null) => {
    const next: ListSpec = { q: query, exact, scopeId: id ?? "", sort: !id || query ? "best" : sort };
    const key = keyOf(next);
    if (key === listKey || key === aheadKey.current) return;
    aheadKey.current = key;
    void readPage(next, 1)
      .then((p) => warmPictures(p.rows.slice(0, EAGER), () => aheadKey.current === key, WARM_AHEAD_AT_ONCE))
      .catch(() => {});
  };
  const prepare = (el: HTMLElement) => {
    const id = el.dataset.ahead;
    if (id === undefined) return;
    lookAhead(id || null);
    for (const k of (id && places.get(id)?.below) || []) {
      const url = getCdnUrl(k.thumbnailUrl, 160);
      if (!url || roundPictures.current.has(url)) continue;
      roundPictures.current.add(url);
      new Image().src = url;
    }
  };
  const prepareNow = (e: { currentTarget: HTMLElement }) => prepare(e.currentTarget);
  const rest = {
    onPointerEnter: (e: { pointerType: string; currentTarget: HTMLElement }) => {
      if (e.pointerType !== "mouse") return;
      const el = e.currentTarget;
      window.clearTimeout(resting.current);
      resting.current = window.setTimeout(() => prepare(el), REST_MS);
    },
    onPointerLeave: () => window.clearTimeout(resting.current),
    onPointerDown: prepareNow,
    onFocus: prepareNow,
  };

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
      {scope ? <span className="text-[#666]"> in {scope.name}</span> : null}
    </>
  ) : (
    scope?.name
  );
  const foundLine = found
    ? info?.loose
      ? "No product has every word. These come closest."
      : `${found.capped ? `${count(found.total)}+` : count(found.total)} ${found.total === 1 ? "product" : "products"}`
    : "";
  // Under a search's or a category's heading (the whole catalogue's size is in the card at the top).
  const sub = status === "loading" && !found ? "Finding products…" : foundLine;
  // Below 1024px a category's size is in its heading, as the shop's category page has it; so the line under says
  // only what a search found.
  const scopeSize = place?.count ?? found?.total ?? null;
  const phoneSub = query ? (status === "loading" && !found ? "Finding products…" : foundLine) : "";

  // The navbar's All Categories rows (CategoryMegaPanel) on a pale rail, the marked one white with the brand's bar
  // down its left edge; each with its category's own photo, small and round, where the navbar draws a line glyph (the
  // owner, the same day: "icons elame ai maari eruku edhuvumae realistic ila ... alibaba perfection", as Alibaba
  // shows a category by a real product's picture). 500 where the shop sets 600: the Centre's Roboto has 400, 500, 700.
  const railRow = (on: boolean) =>
    `flex w-full items-center gap-3 border-l-4 py-1 pl-3.5 pr-3 text-left text-[14px] font-medium leading-5 transition-colors ${
      on ? "border-brand bg-white text-brand-dark" : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
      <p className="flex-1 text-[13.5px] font-medium leading-relaxed text-emerald-900">Welcome, {firstName}. Your supplier account is ready.</p>
      <button type="button" onClick={() => setShowWelcome(false)} aria-label="Dismiss" className="rounded-full p-1 text-emerald-700 hover:bg-emerald-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <main className="px-4 pb-16 sm:px-6 lg:px-8 lg:pb-0 lg:pt-7">
      <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8 xl:gap-10">
        {/* The list, down the left from lg (see chooseFromRail), never moving while the products scroll: held at the
            place it starts, 84px down (the bar's 56 and the page's 28), as tall as the screen less the footer's room
            (62px) and a gap, so at the very end of a list it is never pushed up under the bar nor drawn over the
            footer; the products' bottom space is the section's own, so its column runs down to the footer. 300px: the
            longest name, "Women's Outerwear & Jackets", whole on one line beside its picture and the scrollbar. */}
        <aside className="hidden lg:block" aria-label="Categories">
          <div className="sticky top-[84px] flex h-[max(15rem,calc(100dvh-154px))] flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-50">
            <p className="shrink-0 px-5 pb-2 pt-4 text-[16px] font-bold text-[#111]">Categories</p>
            <nav ref={railNav} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
              <button
                type="button"
                onClick={() => {
                  setRailFrom(null);
                  chooseFromRail(null);
                }}
                data-ahead=""
                data-rail=""
                {...rest}
                aria-current={!scope ? "true" : undefined}
                className={railRow(!scope)}
              >
                {/* Everything: the round grid mark the View all over the products has. */}
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                  <LayoutGrid size={16} strokeWidth={1.6} />
                </span>
                <span className="min-w-0 flex-1 truncate">All products</span>
              </button>
              {rail.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    setRailFrom(e.id);
                    chooseFromRail(scopeOf(e.id, e.name));
                  }}
                  data-ahead={e.id}
                  data-rail={e.id}
                  {...rest}
                  aria-current={railOn === e.id ? "true" : undefined}
                  className={railRow(railOn === e.id)}
                >
                  <RailPicture url={e.thumbnailUrl} on={railOn === e.id} />
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <section className="min-w-0 lg:pb-16">
          {showWelcome && welcomeNote("mb-5 hidden lg:flex")}

          {/* The search. Below 1024px the top of the page, held there as the page scrolls (under the bar from 768px,
              where the bar is held too), with the families' row under it; from 1024px, the card at the head of the
              products. */}
          <div
            ref={strip}
            className="sticky top-0 z-[45] -mx-4 border-b border-slate-200/70 bg-white sm:-mx-6 md:top-14 lg:static lg:z-auto lg:mx-0 lg:rounded-2xl lg:border-0 lg:px-6 lg:py-5 lg:ring-1 lg:ring-[#e6e6e6]"
          >
            {/* The page's name and the way to add a product the catalogue does not list, as a marketplace labels them
                (2026-10-26: "some contents are feels like ai": the question for a heading, the sentence of
                instructions with words in bold, "Not listed?" before the button). The products start under the
                search; the catalogue's size is in the box. */}
            <div className="hidden items-center justify-between gap-4 lg:flex">
              <h1 className="text-[22px] font-bold leading-tight text-[#111]">Find products</h1>
              <button
                type="button"
                onClick={ownProduct}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-[13px] font-bold text-brand-dark ring-1 ring-[#cfdcdf] transition-colors hover:bg-[#f2f8f9]"
              >
                <PackagePlus className="h-4 w-4" aria-hidden="true" />
                Add a product not in our catalogue
              </button>
            </div>

            {/* Keeps the strip's height while, on a phone, the search is the whole screen. */}
            <div className="h-14 px-4 py-2 sm:px-6 lg:mt-3.5 lg:h-auto lg:p-0">
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
                      // The catalogue's size, said here once, as a shop's box says it. No examples in it: they read as
                      // written for the page, and were cut mid-word on a phone; the search lists some when opened.
                      placeholder={total ? `Search ${count(total)} products` : "Search products"}
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
                          Add a product not in our catalogue
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
                <h1 className="min-w-0 text-[19px] font-bold leading-tight text-slate-900">All products</h1>
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
                Add a product not in our catalogue
              </button>
            )}
          </div>

          {/* A search's or a category's own heading, its size and its order; the whole catalogue needs none, the card
              above says what it is. */}
          {(query || scope) && (
            <div className="mt-5 hidden flex-wrap items-end justify-between gap-x-4 gap-y-3 lg:flex">
              <div className="min-w-0">
                {/* Inside a family, where the category sits and the way back up: the levels above it only, so the
                    trail never says again what the heading says (it did, cut short: "Home Impro…"). A family needs
                    none; the list beside shows it picked. */}
                {scope && !query && place && place.path.length > 1 && (
                  <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1 text-[13px] text-[#777]">
                    <button type="button" onClick={() => pick(null)} className="hover:text-[#111] hover:underline">
                      All products
                    </button>
                    {place.path.slice(0, -1).map((a) => (
                      <span key={a.id} className="flex items-center gap-1">
                        <ChevronRight className="h-3.5 w-3.5 text-[#bbb]" aria-hidden="true" />
                        <button type="button" onClick={() => pick(a.id)} className="hover:text-[#111] hover:underline">
                          {a.name}
                        </button>
                      </span>
                    ))}
                  </nav>
                )}
                <h2 className="text-[18px] font-bold text-[#111]">{heading}</h2>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-[#666]">
                  <span className="tabular-nums">{sub}</span>
                  {scope && query && (
                    <button
                      type="button"
                      onClick={() => choose(null)}
                      className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[12px] font-medium text-[#333] ring-1 ring-[#e0e0e0] hover:ring-brand/60"
                    >
                      Search every category <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  )}
                </p>
              </div>
              {sortSelect(false)}
            </div>
          )}

          {/* From 1024px, what is under the category shown, as round pictures over its products (see `row`): all of
              them, wrapping onto a second line for the largest families rather than hidden behind arrows. Each one's
              list is read ahead while the pointer rests on it. */}
          {row && (
            <div className="mt-4 hidden rounded-2xl bg-white px-4 pb-3.5 pt-4 ring-1 ring-[#e6e6e6] lg:block">
              <ul aria-label={`Categories in ${row.name}`} className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-x-2 gap-y-4">
                <li data-ahead={row.id} {...rest}>
                  <GridTile label="View all" ariaLabel={`All of ${row.name}`} on={scope?.id === row.id} big onClick={() => chooseFromRail(scopeOf(row.id))} />
                </li>
                {row.below.map((k) => (
                  <li key={k.id} data-ahead={k.id} {...rest}>
                    <Tile category={k} on={scope?.id === k.id} big eager onClick={() => chooseFromRail(scopeOf(k.id, k.name))} />
                  </li>
                ))}
              </ul>
            </div>
          )}

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
                  <PackagePlus className="h-4 w-4" aria-hidden="true" /> Add a product not in our catalogue
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
            <p className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] text-[#666]">
              {query || scope ? <span>That&apos;s every product here.</span> : null}
              <button type="button" onClick={ownProduct} className="font-semibold text-brand-dark hover:underline">
                Add a product not in our catalogue
              </button>
            </p>
          )}
        </section>
      </div>

      {sheet && (
        <ApplySheet
          key={sheet.kind === "catalogue" ? `product-${sheet.product.id}` : "own"}
          target={sheet}
          contact={contact}
          onClose={closeSheet}
          onSent={onSent}
          onPickCatalogue={(product) => setSheet({ kind: "catalogue", product })}
        />
      )}
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

/**
 * A row's picture in the list down the left: its category's photo, small and round (the pictures over the products,
 * in little), ringed in the brand's colour on the marked row; the original if the resizer fails it, as a product
 * card's does, then a grey round mark. Every row's is asked for at once, at low priority, so the rows further down
 * have theirs when the list is scrolled.
 */
function RailPicture({ url, on }: { url: string | null; on: boolean }) {
  const resized = getCdnUrl(url, 64);
  const original = getCdnUrl(url);
  const [src, setSrc] = useState(resized);
  return (
    <span
      aria-hidden="true"
      className={`grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-white ${on ? "ring-2 ring-brand" : "ring-1 ring-slate-200"}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={32}
          height={32}
          decoding="async"
          fetchPriority="low"
          onError={() => setSrc((s) => (s === resized && original && original !== resized ? original : null))}
          className="size-full object-cover"
        />
      ) : (
        <Layers size={15} className="text-slate-400" />
      )}
    </span>
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
  const resized = tileSrc(product.imageUrl);
  const original = getCdnUrl(product.imageUrl);
  // The resized picture; the original if the resizer fails it (some failed after ten seconds); then none.
  const [src, setSrc] = useState(resized);
  // A shimmer until the picture is in, not an empty grey square that reads as "not showing", and the picture fading
  // in over it; one the browser has already (read ahead, or shown before) is there from the first frame instead.
  const [shown, setShown] = useState<"no" | "fade" | "at-once">("no");
  const picture = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const img = picture.current;
    if (img?.complete && img.naturalWidth > 0) setShown("at-once");
  }, [src]);
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-[#ececec] transition-shadow hover:shadow-[0_10px_28px_rgba(0,0,0,0.08)] hover:ring-[#dcdcdc]">
      <button type="button" onClick={onApply} className="relative block aspect-square overflow-hidden bg-[#f5f5f5]" aria-label={`Apply to supply ${product.name}`}>
        {src ? (
          <>
            {shown === "no" && <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-[#eceff0]" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={picture}
              src={src}
              alt=""
              width={TILE_WIDTH}
              height={TILE_WIDTH}
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              onLoad={() => setShown((s) => (s === "no" ? "fade" : s))}
              onError={() => setSrc((s) => (s === resized && original && original !== resized ? original : null))}
              className={`relative h-full w-full object-cover duration-300 group-hover:scale-[1.04] ${
                shown === "at-once" ? "transition-transform" : "transition-[opacity,transform]"
              } ${shown === "no" ? "opacity-0" : "opacity-100"}`}
            />
          </>
        ) : (
          <span className="flex h-full items-center justify-center text-[12px] text-[#999]">No picture</span>
        )}
        {offerId && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Applied
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col p-3">
        {product.category && <p className="truncate text-[12px] text-[#777]">{product.category}</p>}
        <h3 className="mt-0.5 line-clamp-2 min-h-[2.7em] text-[14px] font-medium leading-[1.35] text-[#222]">{product.name}</h3>
        {offerId ? (
          <Link
            href={`/supplier/applications/#${offerId}`}
            className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-[13px] font-bold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
          >
            View application
          </Link>
        ) : (
          <button
            type="button"
            onClick={onApply}
            className="mt-3 rounded-xl bg-white px-3 py-2 text-[13px] font-bold text-brand-dark ring-1 ring-[#bcd3d9] transition-colors group-hover:bg-brand-dark group-hover:text-white group-hover:ring-brand-dark"
          >
            I have this
          </button>
        )}
      </div>
    </article>
  );
}
