"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, LayoutGrid } from "lucide-react";
import { InquiryModal } from "@/components/ui/InquiryModal";
import { ProductCard } from "@/components/ui/ProductCard";
import { QuickLinkPill } from "@/components/ui/QuickLinkPill";
import { ProductQuoteTile } from "@/components/ui/ProductQuoteTile";
import { useNear } from "@/components/ui/SizedPicture";
import { getCdnUrl } from "@/lib/cdn";
import type { ProductCardData } from "@/components/ui/ProductCard";
import type { SpotlightProduct } from "@/lib/homeGrid";

// Shapes come from src/lib/rankings.ts, which is what produces them — the
// server page and this component must not drift apart on the type of the very
// data one hands the other.
import type { RankGroup } from "@/lib/rankings";
type Tab = "hot" | "popular" | "all";
type Scope = { id: string; name: string; thumbnailUrl?: string | null };
/** What the quote form is opened with, from a ranked product or a catalogue card. */
type QuoteProduct = { id: number | string; name: string; imageUrl: string | null; images: string[]; categoryRef: { name?: string | null } | null };

/** Categories a read brings after the twelve the server renders (DEFAULT_GROUP_LIMIT, which a client module cannot import). */
const GROUP_PAGE = 24;
/** Products a read brings on the All tab: whole rows at two, three, four, five and six across. */
const ALL_PAGE = 60;
/**
 * How far below the screen the next read starts: 8000px, about three reads'
 * worth of categories at a desk. A read comes back in milliseconds (every page
 * is a slice of one cached list), and the margin covers the one that waits on
 * the list's rebuild (a few seconds, once every five minutes), so the next
 * categories are on the page before a scroll reaches them, and there is
 * nothing to wait for, no button and no placeholder (the owner, 2026-10-11).
 */
const READ_AHEAD = "0px 0px 8000px 0px";
/** A read that fails is tried again this many times, a moment apart, before the page says so. */
const RETRIES = 3;
/**
 * What each product's picture is drawn at: a row to swipe on a phone; four
 * across a tablet, six from 1024px (beside the categories from 1280px), eight
 * from 1536px, inside a card's 20px padding.
 */
const SIZES =
  "(min-width: 1920px) 188px, (min-width: 1536px) calc(12.5vw - 52px), (min-width: 1280px) calc(16.7vw - 66px), (min-width: 1024px) calc(16.7vw - 24px), (min-width: 768px) calc(25vw - 28px), (min-width: 640px) 28vw, 40vw";

/**
 * A category of the ranking, as Amazon's Best Sellers lays each one out: its
 * name and what it belongs to, the way to all of it, and a row of its
 * products, each with its place ("#1"), its name and the way to a quote (eight
 * on a wide screen, six on a laptop, four on a tablet, a row to swipe on a
 * phone). The categories are in order, biggest first, and not numbered: their
 * numbers in gold, silver and bronze circles read to the owner as made by a
 * machine, and cards of three bare pictures as weak (2026-10-11).
 */
function RankSection({ group, onQuote }: { group: RankGroup; onQuote: (p: SpotlightProduct) => void }) {
  // Its pictures load as it comes within three screens, not at the browser's own one.
  const [ref, near] = useNear<HTMLLIElement>();
  const href = `/products/?categoryId=${encodeURIComponent(group.id)}`;
  const products: SpotlightProduct[] = group.products
    .filter((p) => p.imageUrl)
    .slice(0, 8)
    .map((p) => ({ id: p.id, name: p.name, image: p.imageUrl!, category: group.name }));
  return (
    <li ref={ref} className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-5">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          {/* h2: each category is a section directly under the page's h1. */}
          <h2 className="truncate text-[17px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[18px]">
            <Link href={href} className="hover:text-brand-dark">
              {group.name}
            </Link>
          </h2>
          {group.parentName && <p className="mt-1 truncate text-[13px] text-slate-500">{`in ${group.parentName}`}</p>}
        </div>
        <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 rounded-sm text-[13px] font-semibold text-brand-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50">
          View all
          <ChevronRight size={15} aria-hidden="true" />
        </Link>
      </div>
      <ul className="-mx-4 mt-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:scroll-px-5 sm:px-5 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-6 2xl:grid-cols-8 [&::-webkit-scrollbar]:hidden">
        {products.map((p, i) => (
          <li
            key={p.id}
            className={`w-[40%] max-w-[200px] shrink-0 snap-start sm:w-[28%] md:w-auto md:max-w-none ${i >= 6 ? "md:max-2xl:hidden" : i >= 4 ? "md:max-lg:hidden" : ""}`}
          >
            <ProductQuoteTile p={p} near={near} sizes={SIZES} onQuote={onQuote} rank={i + 1} />
          </li>
        ))}
      </ul>
    </li>
  );
}

/** What a tab and scope shows: its ranked categories, or on the All tab its products, as many as are read so far. */
type List = { kind: "groups"; items: RankGroup[]; more: boolean } | { kind: "products"; items: ProductCardData[]; more: boolean; page: number };
const keyOf = (tab: Tab, scope: string | null) => `${tab}|${scope ?? ""}`;
const parse = (key: string) => {
  const [tab, scope] = key.split("|");
  return { tab: tab as Tab, scope: scope || null };
};

/** The next read for a list: a slice of the ranking, or a page of products. */
async function readNext(key: string, list: List | undefined): Promise<List> {
  const { tab, scope } = parse(key);
  if (tab === "all") {
    const page = list?.kind === "products" ? list.page + 1 : 1;
    const params = new URLSearchParams({ page: String(page), limit: String(ALL_PAGE) });
    if (scope) params.set("categoryId", scope);
    const res = await fetch(`/api/products/?${params.toString()}`);
    if (!res.ok) throw new Error(`products ${res.status}`);
    const j = await res.json();
    const items: ProductCardData[] = j.data || [];
    const before = list?.kind === "products" ? list.items : [];
    const seen = new Set(before.map((p) => p.id));
    return { kind: "products", items: [...before, ...items.filter((p) => !seen.has(p.id))], more: page < (j.pagination?.totalPages || 1) && items.length > 0, page };
  }
  const before = list?.kind === "groups" ? list.items : [];
  const params = new URLSearchParams({ tab, offset: String(before.length), limit: String(GROUP_PAGE) });
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
 * The first twelve categories arrive as props, already rendered by the server
 * (see page.tsx); every one after them is read four screens ahead of the
 * scroll, from one cached list, so there is nothing to wait for: no "Load More
 * Categories" button, no grey placeholders, and no footer under a list that
 * keeps coming (the owner, 2026-10-11). Every list read is kept (tab and
 * scope), so going back to one is instant; pointing at a scope or a tab reads
 * its first categories before it is chosen, and choosing one not yet read
 * keeps the page as it is until its own arrive.
 *
 * The scopes are the top-level categories: from 1280px a list down the side,
 * compact enough to be whole on the screen, held in view where the screen is
 * tall enough to hold all of it (it scrolled inside itself, with a scrollbar
 * of its own, which the owner saw as the sidebar changing under the scroll);
 * a row to swipe below 1280px.
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
  const [scope, setScope] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("hot");
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
  const [quote, setQuote] = useState<QuoteProduct | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const wanted = keyOf(tab, scope);
  // A choice shows its list at once if it is read, and when it arrives if not; until then the page stays as it
  // is (state from the last render, as React has it for derived values).
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

  // The next categories, read as the list's end comes within READ_AHEAD; a new observer for every new length (and
  // every failure), so a read that leaves the end still near reads the next.
  useEffect(() => {
    const el = end.current;
    if (!el || !list.more || switching || shownFailed >= RETRIES) return;
    let t: number | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (shownFailed) t = window.setTimeout(() => read(shown), 1200 * shownFailed);
        else read(shown);
      },
      { rootMargin: READ_AHEAD },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(t);
    };
  }, [shown, list.items.length, list.more, switching, shownFailed, read]);

  const tryAgain = (key: string) => {
    setFailures((m) => new Map([...m].filter(([k]) => k !== key)));
    read(key);
  };
  const scopeName = (key: string) => {
    const id = parse(key).scope;
    return id ? scopes.find((s) => s.id === id)?.name ?? "this category" : initialScopeName;
  };
  // A new list starts from its top.
  const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const chooseScope = (id: string | null) => {
    setScope(id);
    toTop();
  };
  const chooseTab = (key: Tab) => {
    setTab(key);
    toTop();
  };
  const quoteRanked = (p: SpotlightProduct) => setQuote({ id: p.id, name: p.name, imageUrl: p.image, images: [p.image], categoryRef: { name: p.category } });

  const tabs: { key: Tab; label: string }[] = [
    { key: "hot", label: "Hot selling" },
    { key: "popular", label: "Most popular" },
    { key: "all", label: "All" },
  ];
  const scopeList: Scope[] = [{ id: "", name: "All categories" }, ...scopes];
  const isOn = (s: Scope) => (s.id || null) === scope;
  const warm = (s: Scope) => read(keyOf(tab, s.id || null));

  return (
    <div className="min-h-screen bg-slate-50 pt-20 font-sans">
      <div className="mx-auto max-w-[1920px] px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <div className="xl:grid xl:grid-cols-[256px_minmax(0,1fr)] xl:gap-8 2xl:grid-cols-[272px_minmax(0,1fr)]">
          {/* The scopes down the side, from 1280px, level with the page's title, as Amazon's Best Sellers
              has them. On a screen 700px tall or more they are held in view and fill the column to the screen's
              foot, the rows sharing its height (from 36px each to 64px; 50px on the owner's screen): the list
              ended halfway down with the column empty under it, and a quote box put there the owner did not
              want (2026-10-11). On a shorter screen they scroll with the page. Never a scrollbar of their own. */}
          <nav aria-label="Categories" className="hidden xl:block">
            <ul className="flex flex-col gap-px [@media(min-height:700px)]:sticky [@media(min-height:700px)]:top-[calc(var(--nav-shift,4rem)+16px)] [@media(min-height:700px)]:h-[calc(100vh-112px)]">
              {scopeList.map((s) => {
                const on = isOn(s);
                return (
                  <li key={s.id || "all"} className="flex min-h-9 flex-1 [@media(min-height:700px)]:max-h-16">
                    <button
                      type="button"
                      onClick={() => chooseScope(s.id || null)}
                      onPointerEnter={() => warm(s)}
                      onFocus={() => warm(s)}
                      aria-current={on ? "true" : undefined}
                      className={`flex w-full items-center gap-3 rounded-lg px-2.5 text-left text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
                        on ? "bg-slate-900 font-semibold text-white" : "font-medium text-slate-600 hover:bg-white hover:text-slate-900"
                      }`}
                    >
                      <span className={`relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md ${on ? "bg-white/15" : "bg-white ring-1 ring-inset ring-slate-200/80"}`}>
                        {s.id ? (
                          s.thumbnailUrl && (
                            // eslint-disable-next-line @next/next/no-img-element -- a 28px thumbnail; next/image writes no srcset here (unoptimized) and adds nothing.
                            <img src={getCdnUrl(s.thumbnailUrl, 96) as string} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                          )
                        ) : (
                          <LayoutGrid size={15} className={on ? "text-white" : "text-brand"} aria-hidden="true" />
                        )}
                      </span>
                      <span className="truncate">{s.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="min-w-0">
            {/* This page had no h1 at all. Its headings started at h3, on the
                product cards — a URL in the sitemap, canonical to itself, with a
                title and a description and no heading on the page. Above the
                sticky bar rather than inside it, so it scrolls away. */}
            <header className="pb-4">
              <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-900 sm:text-3xl">Top ranking</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600 sm:text-[15px]">The categories we source most, biggest first. Pick any product to ask for a quote.</p>
            </header>

            {/* The bar: below 1280px the scopes as a row to swipe; the tabs and the catalogue link at every width.
                Opaque: a see-through, blurred bar redrew the blur on every frame of a scroll. */}
            <div className="sticky top-[var(--nav-shift,4rem)] z-30 -mx-4 border-b border-slate-200/70 bg-slate-50 px-4 pb-3 pt-3 transition-[top] duration-300 sm:-mx-6 sm:px-6 xl:mx-0 xl:px-0">
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)] [scrollbar-width:none] sm:-mx-6 sm:px-6 xl:hidden [&::-webkit-scrollbar]:hidden">
                {scopeList.map((s) => (
                  <button
                    key={s.id || "all"}
                    type="button"
                    onClick={() => chooseScope(s.id || null)}
                    onPointerEnter={() => warm(s)}
                    onFocus={() => warm(s)}
                    aria-current={isOn(s) ? "true" : undefined}
                    className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors ${
                      isOn(s) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
                {/* Room after the last, so it can come out of the fade. */}
                <span className="w-6 shrink-0" aria-hidden="true" />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 xl:mt-0">
                <div className="inline-flex items-center gap-1 rounded-full bg-slate-200/60 p-1">
                  {tabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => chooseTab(t.key)}
                      onPointerEnter={() => read(keyOf(t.key, scope))}
                      onFocus={() => read(keyOf(t.key, scope))}
                      aria-pressed={tab === t.key}
                      className={`rounded-full px-4 py-1.5 text-[13px] font-bold transition-colors sm:px-5 ${
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

            {/* While a choice not yet read is on its way, the page stays, a shade lighter. */}
            <div className={`mt-5 transition-opacity duration-200 ${switching ? "opacity-60" : ""}`} aria-busy={switching}>
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
                  <p className="mb-4 text-sm text-slate-500">
                    Showing products in <span className="font-semibold text-slate-800">{scopeName(shown)}</span>
                  </p>
                  {list.items.length === 0 && !list.more ? (
                    <div className="py-16 text-center text-slate-500">No products found in this category yet.</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6">
                      {list.items.map((p, idx) => (
                        <ProductCard
                          key={p.id}
                          product={p}
                          onClick={() => setQuote({ id: p.id, name: p.name, imageUrl: p.imageUrl ?? null, images: p.imageUrl ? [p.imageUrl] : [], categoryRef: p.categoryRef ?? null })}
                          priority={idx < 12}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : list.items.length === 0 && !list.more ? (
                <div className="py-20 text-center text-slate-400">No rankings available for this category.</div>
              ) : (
                <ol className="flex flex-col gap-4">
                  {list.items.map((g) => (
                    <RankSection key={g.id} group={g} onQuote={quoteRanked} />
                  ))}
                </ol>
              )}

              {list.more ? (
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
              ) : (
                list.items.length > 0 && (
                  <p className="mt-10 text-center text-sm text-slate-500">
                    {list.kind === "groups" ? `That is every category in ${scopeName(shown)}.` : "That is every product here."}{" "}
                    <Link href="/products/" className="font-semibold text-brand-dark hover:underline">
                      Browse the full catalogue
                    </Link>
                  </p>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {quote && <InquiryModal product={quote} onClose={() => setQuote(null)} />}
    </div>
  );
}
