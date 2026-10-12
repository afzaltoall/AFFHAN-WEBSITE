"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { InquiryModal } from "@/components/ui/InquiryModal";
import { ProductCard } from "@/components/ui/ProductCard";
import { Pagination } from "@/components/ui/Pagination";
import { BorderBeamPanel } from "@/components/ui/border-beam-panel";
import { QuickLinkPill } from "@/components/ui/QuickLinkPill";
import { Picture, useNear } from "@/components/ui/SizedPicture";
import type { ProductCardData } from "@/components/ui/ProductCard";

// Shapes come from src/lib/rankings.ts, which is what produces them — the
// server page and this component must not drift apart on the type of the very
// data one hands the other.
import type { RankProduct, RankGroup } from "@/lib/rankings";
type Tab = "hot" | "popular" | "all";
type Scope = { id: string; name: string };

/**
 * The rest of a list in one read, after the fifteen the server renders: every
 * category there is (about 570). One request, not a request a batch: each
 * read of the ranking waited on the dev server's rebuild of the whole list
 * (2 to 3s) whenever the browser asked for no caching, as DevTools does with
 * "Disable cache", and a quick scroll caught the end of the cards 269 times
 * (measured, 2026-10-12). Production answers from its cache in milliseconds.
 */
const REST = 1000;
/** Cards added to the page as its end comes near, from the list already read: ten rows of three. */
const REVEAL = 30;
/** Products a page of the All tab holds: whole rows at two, three, four and six across. */
const ALL_PAGE_SIZE = 60;
/**
 * How far below the screen the next cards are added: 4000px, fifteen rows.
 * They come from the list already read, so adding them costs a render and
 * nothing else, and they are on the page before a scroll reaches them: there is
 * nothing to wait for, no "Load More Categories" button and no grey placeholder
 * (the owner, 2026-10-11).
 */
const READ_AHEAD = "0px 0px 4000px 0px";
/** A read that fails is tried again this many times, a moment apart, before the page says so. */
const RETRIES = 3;
/**
 * A tile's picture: 300px wide, the one size the live page always fetched
 * (getCdnUrl at 300), so the image handler's edge already holds most of them.
 * New sizes for these products were cut on first request, a picture at a
 * time, and a quick scroll reached the tiles before their pictures (the owner,
 * 2026-10-12). At about 150px a tile, 300 is right for a 2x screen.
 */
const TILE_WIDTHS = [300] as const;
const TILE_SIZES = "(min-width: 1648px) 151px, (min-width: 1280px) calc(11.1vw - 30px), (min-width: 768px) calc(16.7vw - 33px), calc(33.3vw - 28px)";

// Rank badge colours — #1 gold, #2 silver, #3 bronze/orange (Alibaba-style).
function rankStyle(rank: number): string {
  if (rank === 1) return "bg-gradient-to-br from-amber-400 to-amber-500";
  if (rank === 2) return "bg-gradient-to-br from-slate-300 to-slate-400";
  return "bg-gradient-to-br from-orange-400 to-orange-500";
}

function RankTile({ product, near, onClick }: { product: RankProduct; near: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group/tile flex flex-col text-left w-full">
      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200/70">
        <span className={`absolute top-0 left-0 z-10 flex items-center justify-center w-6 h-6 rounded-br-lg text-white text-[11px] font-black shadow-sm ${rankStyle(product.rank)}`}>
          {product.rank}
        </span>
        {product.imageUrl ? (
          // Sized to the tile and fetched as the card comes near (SizedPicture), not the browser's own one screen
          // ahead: a quick scroll used to reach the tiles before their pictures.
          <Picture
            url={product.imageUrl}
            widths={TILE_WIDTHS}
            sizes={TILE_SIZES}
            near={near}
            className="object-cover group-hover/tile:scale-105 transition-transform duration-500"
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

/**
 * Memoised: a new batch renders only its own cards. Every card used to render
 * again on every read, so the hundredth batch rendered the hundreds before it.
 * Its props are stable for that: the group is the same object from read to
 * read, and the handlers come from the page's own state and router.
 */
const RankingCard = memo(function RankingCard({ group, onSelect, onViewAll, seed }: { group: RankGroup; onSelect: (p: RankProduct) => void; onViewAll: (id: string) => void; seed: number }) {
  // Its pictures load as it comes within a few screens. The wrapper is a flex box so the panel still stretches to
  // its row's height, as it did as the grid's own item.
  const [ref, near] = useNear<HTMLDivElement>();
  return (
    <div ref={ref} className="flex min-w-0">
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
          {/* h2, not h3: each group card is a section directly under the page
              h1, and with no h2 anywhere the document jumped h1 -> h3. Tailwind's
              preflight resets heading size and weight to inherit, and the size
              here is set by the classes, so this is a semantic change only —
              nothing moves. */}
          <h2 className="font-extrabold text-slate-900 text-[15px] sm:text-base truncate tracking-tight">{group.name}</h2>
          <button onClick={() => onViewAll(group.id)} className="shrink-0 inline-flex items-center gap-0.5 text-xs font-semibold text-brand-dark hover:gap-1.5 transition-all">
            View all <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {group.products.slice(0, 3).map((p) => (
            <RankTile key={p.id} product={p} near={near} onClick={() => onSelect(p)} />
          ))}
        </div>
      </BorderBeamPanel>
    </div>
  );
});

/** What a tab and scope shows: its ranking cards as many as are read so far, or on the All tab a page of its products. */
type List = { kind: "groups"; items: RankGroup[]; more: boolean } | { kind: "products"; items: ProductCardData[]; more: false; totalPages: number };
/** A list's key: the tab, the scope, and on the All tab the page. */
const keyOf = (tab: Tab, scope: string | null, page = 1) => (tab === "all" ? `all|${scope ?? ""}|${page}` : `${tab}|${scope ?? ""}`);
const parse = (key: string) => {
  const [tab, scope, page] = key.split("|");
  return { tab: tab as Tab, scope: scope || null, page: Number(page) || 1 };
};

/** The next read for a list: a slice of the ranking, or a page of products. */
async function readNext(key: string, list: List | undefined): Promise<List> {
  const { tab, scope, page } = parse(key);
  if (tab === "all") {
    const params = new URLSearchParams({ page: String(page), limit: String(ALL_PAGE_SIZE) });
    if (scope) params.set("categoryId", scope);
    const res = await fetch(`/api/products/?${params.toString()}`);
    if (!res.ok) throw new Error(`products ${res.status}`);
    const j = await res.json();
    return { kind: "products", items: j.data || [], more: false, totalPages: j.pagination?.totalPages || 1 };
  }
  const before = list?.kind === "groups" ? list.items : [];
  const params = new URLSearchParams({ tab, offset: String(before.length), limit: String(REST) });
  if (scope) params.set("parentId", scope);
  const res = await fetch(`/api/rankings/?${params.toString()}`);
  if (!res.ok) throw new Error(`rankings ${res.status}`);
  const j = await res.json();
  const seen = new Set(before.map((g) => g.id));
  const items: RankGroup[] = j.groups || [];
  return { kind: "groups", items: [...before, ...items.filter((g) => !seen.has(g.id))], more: Boolean(j.hasMore) && items.length > 0 };
}

/**
 * The interactive half of /rankings/.
 *
 * The first cards arrive as props, already rendered by the server — see
 * page.tsx, which also builds the category chips, so they are on the first
 * paint rather than after the browser has downloaded the category tree.
 * Before that this component owned the whole page and fetched its own API on
 * mount, so the server sent skeletons and nothing else: LCP was 6.16s, and a
 * crawler that does not run JavaScript saw an empty shell on a url the
 * sitemap advertises.
 *
 * The page as it is live, with what the owner asked of it (2026-10-11): every
 * category shown, with nothing to wait for; no "Load More Categories" button,
 * no footer under a list that keeps going, and no grey placeholder cards. The
 * rest of a list is read in one request (REST) as soon as the page is up, and
 * its cards are added READ_AHEAD before a scroll reaches them. Every list read
 * is kept (tab, scope and the All tab's page), so going back to one is
 * instant; pointing at a chip or a tab reads it before it is chosen, and
 * choosing one not yet read keeps the page as it is until its own arrives.
 */
export function RankingsClient({
  initialGroups,
  initialHasMore,
  initialScopeName,
  scopes,
}: {
  initialGroups: RankGroup[];
  initialHasMore: boolean;
  initialScopeName: string;
  scopes: Scope[];
}) {
  const router = useRouter();
  const [scope, setScope] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("hot");
  const [allPage, setAllPage] = useState(1);
  // Every list read so far, by tab and scope. The server's first page is in it from the start.
  const [lists, setLists] = useState<Map<string, List>>(() => new Map([[keyOf("hot", null), { kind: "groups", items: initialGroups, more: initialHasMore }]]));
  // The lists as of the last render, for reads started from handlers and observers.
  const latest = useRef(lists);
  useEffect(() => {
    latest.current = lists;
  }, [lists]);
  const reading = useRef(new Set<string>());
  // Failed reads, by list: tried again a moment later, and named on the page once RETRIES have failed.
  const [failures, setFailures] = useState<Map<string, number>>(() => new Map());
  const [inquiryProduct, setInquiryProduct] = useState<ProductCardData | null>(null);
  const scopeScrollRef = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);

  const wanted = keyOf(tab, scope, allPage);
  // A choice shows its list at once if it is read, and when it arrives if not; until then the cards on screen
  // stay (state from the last render, as React has it for derived values).
  const [shown, setShown] = useState(wanted);
  if (shown !== wanted && lists.has(wanted)) setShown(wanted);

  // One read at a time per list, whoever asks (the scroll, a pointer, a choice, an effect run twice).
  const read = useCallback((key: string) => {
    if (reading.current.has(key)) return;
    const list = latest.current.get(key);
    if (list && !list.more) return;
    reading.current.add(key);
    readNext(key, list)
      .then((next) => {
        setLists((m) => new Map(m).set(key, next));
        setFailures((m) => (m.has(key) ? new Map([...m].filter(([k]) => k !== key)) : m));
      })
      .catch(() => setFailures((m) => new Map(m).set(key, (m.get(key) ?? 0) + 1)))
      .finally(() => reading.current.delete(key));
  }, []);

  const failed = failures.get(wanted) ?? 0;
  const shownFailed = failures.get(shown) ?? 0;

  // The chosen list, read if it is not; after a failure, again a moment later.
  useEffect(() => {
    if (lists.has(wanted) || failed >= RETRIES) return;
    if (!failed) {
      read(wanted);
      return;
    }
    const t = window.setTimeout(() => read(wanted), 1200 * failed);
    return () => window.clearTimeout(t);
  }, [wanted, lists, failed, read]);

  const list = lists.get(shown)!;
  const switching = shown !== wanted;
  // How many of the shown list's cards are on the page: REVEAL to start with, REVEAL more as the end comes near.
  const [visible, setVisible] = useState({ key: shown, count: REVEAL });
  const count = visible.key === shown ? visible.count : REVEAL;
  const onPage = list.kind === "groups" ? Math.min(count, list.items.length) : list.items.length;
  const unread = list.kind === "groups" && count >= list.items.length && list.more;
  const hasNext = list.kind === "groups" && (count < list.items.length || list.more);

  // The rest of the first list, read as soon as the page is up: by the time anyone has scrolled past the fifteen
  // the server sent, the others are here.
  useEffect(() => {
    read(keyOf("hot", null));
  }, [read]);

  // The next cards as the end comes within READ_AHEAD: from the list already read, or read now if it is not (a
  // list chosen before its read came back). A new observer for every step, so a step that leaves the end still
  // near takes the next.
  useEffect(() => {
    const el = end.current;
    if (!el || !hasNext || switching || (unread && shownFailed >= RETRIES)) return;
    let t: number | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (!unread) setVisible({ key: shown, count: count + REVEAL });
        else if (shownFailed) t = window.setTimeout(() => read(shown), 1200 * shownFailed);
        else read(shown);
      },
      { rootMargin: READ_AHEAD },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(t);
    };
  }, [shown, count, hasNext, unread, switching, shownFailed, read]);

  const tryAgain = (key: string) => {
    setFailures((m) => new Map([...m].filter(([k]) => k !== key)));
    read(key);
  };
  const scopeName = (key: string) => {
    const id = parse(key).scope;
    return id ? scopes.find((s) => s.id === id)?.name ?? "this category" : initialScopeName;
  };

  const scrollScope = (dir: -1 | 1) => scopeScrollRef.current?.scrollBy({ left: dir * 300, behavior: "smooth" });
  const goToCategory = useCallback((id: string) => router.push(`/products/?categoryId=${id}`), [router]);
  // The quote form opens with a ranked product or a catalogue card; a stable handler, for the memoised cards.
  const openInquiry = useCallback((p: RankProduct | ProductCardData) => setInquiryProduct(p as ProductCardData), []);

  // Changing scope/tab shows a new list — jump back to the top so the user sees
  // the new results from the start, not mid-scroll.
  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const selectScope = (id: string | null) => { setScope(id); setAllPage(1); scrollTop(); };
  const selectTab = (key: Tab) => { setTab(key); setAllPage(1); scrollTop(); };

  const tabs: { key: Tab; label: string }[] = [
    { key: "hot", label: "Hot selling" },
    { key: "popular", label: "Most popular" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans pt-20">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pb-12 pt-4">
        {/* This page had no h1 at all. Its headings started at h3, on the
            product cards — a URL in the sitemap, canonical to itself, with a
            title and a description and no heading on the page.

            Above the sticky bar rather than inside it, so it scrolls away and
            does not eat vertical space on a phone once you start browsing.
            This component is server-rendered for the initial HTML like the
            rest of the page, so the heading is in the document a crawler
            receives rather than appearing after hydration. */}
        <header className="pb-4">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-slate-900">
            Top Ranking — the categories we source most
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm sm:text-[15px] leading-relaxed text-slate-600">
            The best-stocked categories in our sourcing catalogue, ranked, with a sample of what each one holds. Nothing here carries a price — it is a guide to what we can source, so ask us to quote on anything you see.
          </p>
        </header>

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
                onPointerEnter={() => read(keyOf(tab, null, 1))}
                className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-semibold border transition-colors ${
                  scope === null ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
                }`}
              >
                All categories
              </button>
              {scopes.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectScope(c.id)}
                  onPointerEnter={() => read(keyOf(tab, c.id, 1))}
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
                  onPointerEnter={() => read(keyOf(t.key, scope, 1))}
                  className={`px-4 sm:px-5 py-1.5 rounded-full text-[13px] font-bold transition-colors ${
                    tab === t.key ? "bg-white text-brand-dark shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <QuickLinkPill href="/products/" icon="/cata.jpg" label="Full Catalog" labelHiddenOnMobile className="shrink-0" />
          </div>
        </div>

        {/* Content. While a choice not yet read is on its way, the cards on screen stay, a shade lighter. */}
        <div className={`mt-5 min-h-[80vh] transition-opacity duration-200 ${switching ? "opacity-60" : ""}`} aria-busy={switching}>
          {switching && failed >= RETRIES && (
            <p className="mb-4 rounded-xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
              {`${scopeName(wanted)} did not load. `}
              <button type="button" onClick={() => tryAgain(wanted)} className="font-semibold text-brand-dark underline underline-offset-2">
                Try again
              </button>
            </p>
          )}
          {list.kind === "products" ? (
            <>
              <p className="text-sm text-slate-500 mb-4">Showing products in <span className="font-semibold text-slate-800">{scopeName(shown)}</span></p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
                {list.items.map((p, idx) => (
                  <ProductCard key={p.id} product={p} onClick={() => setInquiryProduct(p)} priority={idx < 12} />
                ))}
              </div>
              {list.items.length === 0 && (
                <div className="text-center text-slate-500 py-16">No products found in this category yet.</div>
              )}
              <Pagination page={parse(shown).page} totalPages={list.totalPages} onPageChange={(p) => { setAllPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
            </>
          ) : list.items.length === 0 && !list.more ? (
            <div className="text-center text-slate-400 py-20">No rankings available for this category.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {list.items.slice(0, onPage).map((g, i) => (
                <RankingCard key={g.id} group={g} seed={i + 1} onSelect={openInquiry} onViewAll={goToCategory} />
              ))}
            </div>
          )}

          {hasNext ? (
            <>
              <div ref={end} aria-hidden="true" className="h-px" />
              {shownFailed >= RETRIES && (
                <p className="mt-6 text-center text-sm text-slate-600">
                  {"The next categories did not load. "}
                  <button type="button" onClick={() => tryAgain(shown)} className="font-semibold text-brand-dark underline underline-offset-2">
                    Try again
                  </button>
                </p>
              )}
            </>
          ) : null}
        </div>
      </div>

      {inquiryProduct && <InquiryModal product={inquiryProduct} onClose={() => setInquiryProduct(null)} />}
    </div>
  );
}
