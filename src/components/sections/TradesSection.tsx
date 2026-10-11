"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { BedDouble, Car, ChevronRight, Coffee, Hammer, Headphones, Lamp, PartyPopper, PawPrint, Printer, Shirt, Store, Tent, ToyBrick, type LucideIcon } from "lucide-react";
import { srcSetOf, useNear } from "@/components/ui/SizedPicture";
import { InquiryModal, PRODUCT_WIDTHS, ProductQuoteTile, asInquiry } from "@/components/ui/ProductQuoteTile";
import type { SpotlightProduct, Trade } from "@/lib/homeGrid";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50";
const ICONS: Record<string, LucideIcon> = {
  cafe: Coffee,
  pets: PawPrint,
  toys: ToyBrick,
  hardware: Hammer,
  auto: Car,
  events: PartyPopper,
  hotels: BedDouble,
  office: Printer,
  gadgets: Headphones,
  lighting: Lamp,
  outdoor: Tent,
  menswear: Shirt,
};
/**
 * What each tile's picture is drawn at: a row to swipe on a phone; four
 * across the panel from a tablet, beside the trades from a laptop (240px of
 * them, which holds "Outdoor & sports shops" whole), five from 1280px
 * (260px), six from 1536px (280px).
 */
const SIZES =
  "(min-width: 1920px) 243px, (min-width: 1536px) calc(16.7vw - 77px), (min-width: 1280px) calc(20vw - 86px), (min-width: 1024px) calc(25vw - 98px), (min-width: 640px) calc(25vw - 28px), 42vw";
/** Two rows at every width: eight shown below 1280px, ten below 1536px, twelve from there. */
const hiddenAt = (i: number) => (i >= 10 ? "sm:max-2xl:hidden" : i >= 8 ? "sm:max-xl:hidden" : "");
/** A row that scrolls sideways and never wraps: one height, whatever is in it. */
const ROW = "flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
/** Its far edge fades, so a row that runs on reads as one to swipe, not as a cut. */
const FADE = "[mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)]";

/**
 * "Sourcing for your business" (lib/homeGrid.ts, getTrades): the trades the
 * catalogue stocks for, a tab each (a café, a pet shop, a hardware store),
 * and for the one chosen the categories it buys from and products of them,
 * each the way to a quote. A buyer for a business often comes in by the
 * business rather than the product, as Alibaba's industry pages and Amazon
 * Business's are laid out. The day's trade opens first.
 *
 * One height whatever the trade (the owner saw the page move as the tabs
 * changed, 2026-10-11): nothing in it wraps by what it holds. From a laptop
 * up the trades are a list down the left, as Alibaba lists its industries
 * (twelve chips wrapped to three uneven rows there, the last an orphan), and
 * the panel beside them is two rows of products under one row of the
 * trade's categories; below that the trades and the categories are rows to
 * swipe. Every trade's products travel with the page, so a tab shows its own
 * at once; the next two trades' pictures are fetched once the section is
 * near, and any other's as the pointer or the keyboard reaches its tab.
 */
export function TradesSection({ trades }: { trades: Trade[] }) {
  const [at, setAt] = useState(0);
  const [quote, setQuote] = useState<SpotlightProduct | null>(null);
  const [ref, near] = useNear<HTMLElement>();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const warmed = useRef(new Set<number>([0]));

  // The pictures a tab will show, fetched as its own tiles would ask for them (same srcset, same sizes).
  const warm = (i: number) => {
    if (warmed.current.has(i) || !trades[i]) return;
    warmed.current.add(i);
    for (const p of trades[i].products) {
      const img = new Image();
      img.sizes = SIZES;
      img.srcset = srcSetOf(p.image, PRODUCT_WIDTHS);
    }
  };
  // Once near, the two trades after the open one, in the browser's spare time.
  useEffect(() => {
    if (!near) return;
    const next = () => [1, 2].forEach((i) => warm(i));
    if (!("requestIdleCallback" in window)) {
      const id = window.setTimeout(next, 1200);
      return () => window.clearTimeout(id);
    }
    const id = window.requestIdleCallback(next);
    return () => window.cancelIdleCallback(id);
    // warm reads only refs and the trades it was drawn with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near]);

  if (!trades.length) return null;
  const trade = trades[Math.min(at, trades.length - 1)];

  const choose = (i: number) => {
    warm(i);
    setAt(i);
    const tab = tabs.current[i];
    tab?.focus();
    // In the row to swipe, the chosen one is brought into view; in the list down the left it already is.
    tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  // The tabs' keys, as WAI-ARIA has them: the arrows move and choose (either pair, as the list runs across a
  // phone and down a laptop), Home and End go to the ends.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = trades.length - 1;
    const next = at === last ? 0 : at + 1;
    const prev = at === 0 ? last : at - 1;
    const moves: Record<string, number> = { ArrowRight: next, ArrowDown: next, ArrowLeft: prev, ArrowUp: prev, Home: 0, End: last };
    const to = moves[e.key];
    if (to === undefined) return;
    e.preventDefault();
    choose(to);
  };

  return (
    <section ref={ref} aria-labelledby="trades-title" className="liquid-glass-card min-w-0 p-3 sm:p-4 lg:p-5">
      <div className="px-0.5">
        <h2 id="trades-title" className="text-[18px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[21px]">
          Sourcing for your business
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-slate-500 sm:text-[14px]">Pick your trade and see what we can source for it</p>
      </div>

      <div className="mt-3 grid gap-4 sm:mt-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)]">
        <div
          role="tablist"
          aria-label="Trades"
          onKeyDown={onKey}
          className={`${ROW} ${FADE} -mx-3 px-3 pb-1 sm:-mx-4 sm:px-4 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0 lg:[mask-image:none]`}
        >
          {trades.map((t, i) => {
            const Icon = ICONS[t.key] ?? Store;
            const on = t.key === trade.key;
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`trade-tab-${t.key}`}
                aria-selected={on}
                aria-controls="trade-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => choose(i)}
                onPointerEnter={() => warm(i)}
                onFocus={() => warm(i)}
                className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors sm:text-[13.5px] lg:w-full lg:rounded-xl lg:px-3 lg:py-2.5 lg:text-[14px] ${
                  on
                    ? "bg-brand-dark text-white shadow-sm"
                    : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900 lg:bg-transparent lg:ring-0 lg:hover:bg-white/80"
                } ${FOCUS}`}
              >
                <Icon size={17} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{t.title}</span>
                <ChevronRight size={15} className={`ml-auto hidden shrink-0 lg:block ${on ? "text-white/80" : "text-slate-300"}`} aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id="trade-panel" aria-labelledby={`trade-tab-${trade.key}`} className="flex min-w-0 flex-col gap-3 sm:gap-4">
          <div className="flex items-start justify-between gap-4 px-0.5">
            <div className="min-w-0">
              <h3 className="truncate text-[17px] font-bold leading-tight text-slate-900 sm:text-[19px]">{trade.title}</h3>
              {/* One line at every width (lib/homeGrid.ts keeps each to 42 characters), so none moves what is under it. */}
              <p className="mt-1 truncate text-[13.5px] leading-snug text-slate-600">{trade.line}</p>
            </div>
            <Link href="/contact/" className={`hidden shrink-0 items-center gap-0.5 rounded-sm text-[13.5px] font-semibold text-brand-dark hover:underline xl:inline-flex ${FOCUS}`}>
              Stocking a whole shop? Send your list
              <ChevronRight size={15} aria-hidden="true" />
            </Link>
          </div>
          {/* The categories it buys from, the way to each: one row, to swipe where it runs over. */}
          <ul className={`${ROW} ${FADE} -mx-3 px-3 pb-1 pr-8 sm:mx-0 sm:px-0 sm:pb-0 sm:pr-8`}>
            {trade.kinds.map((k) => (
              <li key={k.href} className="shrink-0">
                <Link
                  href={k.href}
                  className={`group inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200 transition-colors hover:text-brand-dark hover:ring-brand/40 sm:text-[13px] ${FOCUS}`}
                >
                  {k.name}
                  <ChevronRight size={14} className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-dark" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <ul className="-mx-3 flex snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-x-4 sm:gap-y-5 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-5 2xl:grid-cols-6 [&::-webkit-scrollbar]:hidden">
            {trade.products.map((p, i) => (
              <li key={p.id} className={`w-[42%] max-w-[210px] shrink-0 snap-start sm:w-auto sm:max-w-none ${hiddenAt(i)}`}>
                <ProductQuoteTile p={p} near={near} sizes={SIZES} onQuote={setQuote} />
              </li>
            ))}
          </ul>
        </div>
      </div>
      {quote && <InquiryModal product={asInquiry(quote)} onClose={() => setQuote(null)} />}
    </section>
  );
}

export default TradesSection;
