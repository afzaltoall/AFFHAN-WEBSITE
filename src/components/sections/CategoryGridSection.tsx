"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronRight } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import type { GridCard, GridCategoryTile, GridProductTile, RankedCard, TilesCard, WeeklyCard } from "@/lib/homeGrid";

const InquiryModal = dynamic(() => import("@/components/ui/InquiryModal").then((m) => m.InquiryModal), { ssr: false });

/** A picture at about twice the width it shows at, for sharp screens. */
const src = (url: string, px: number) => getCdnUrl(url, px) as string;
const stillPlease = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The ground under every picture. A product shot's white melts into it (multiply), so a card's four read as one set. */
const GROUND = "bg-[#f1f4f5]";
/**
 * A card is three rows of the grid it sits in (its heading, its tiles, its
 * link), shared with the cards beside it through subgrid: a two-line title on
 * one card moves its neighbours' tiles down with it, and every link in a row
 * sits on one line. Its surface is the product cards' glass (liquid-glass-card
 * in globals.css: translucent white, a bevelled rim, 28px corners), the
 * owner's ask of 2026-10-08, so the grid and the hero read as one site.
 */
const CARD = "liquid-glass-card row-span-3 grid min-w-0 grid-rows-subgrid gap-y-2 p-2.5 sm:gap-y-3 sm:p-4";
/** A picture inside a card: rounder than a tile, less round than the card, so the corners nest. */
const PICTURE_CORNER = "rounded-xl";
const GRID = "grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4 lg:gap-4";
const BETWEEN = "mt-2.5 sm:mt-3 lg:mt-4";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50";
const MORE_LINK = "inline-flex max-w-full items-center gap-0.5 text-[12px] font-semibold text-brand-dark hover:underline sm:text-[13px]";

/**
 * The homepage's category grid, in place of the "Trending products" fan
 * carousel (the owner's plan of 2026-10-08, after Amazon's homepage): glass
 * cards edge to edge, on the hero's own ground (a grey one dulled the glass and
 * showed the pale photos as lighter squares), four across, each a family of the catalogue or a group
 * of it; the categories buyers asked for most as a numbered card, first; and
 * this week's picks as a band under the first row (lib/homeGrid.ts says where
 * each comes from, and why it is true).
 *
 * Every card is shown, with no button to press for more (the owner,
 * 2026-10-08). The page itself carries the first twelve columns' worth, and
 * the rest come from /api/home-grid on their own as the end of those comes
 * within a couple of screens, so they are in place before anyone scrolls to
 * them. Carrying all of them in the document would put the homepage back
 * where it failed GTmetrix ("No CPU idle period", 1.45MB of HTML), and a test
 * that never scrolls never pays for them. Hovering a tile previews more of
 * what it holds, and only while hovered, so nothing moves on its own. A pick's
 * "Get a quote" opens the quote form; every other press opens a page. Nothing
 * here shows a price.
 */
export function CategoryGridSection({ cards: own, more }: { cards: GridCard[]; more: number }) {
  const [rest, setRest] = useState<GridCard[] | null>(null);
  const [state, setState] = useState<"idle" | "reading" | "failed">("idle");
  const [quote, setQuote] = useState<GridProductTile | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setState("reading");
    const have = new Set(own.map((c) => c.key));
    fetch(`/api/home-grid/?from=${own.length}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`home-grid ${r.status}`))))
      // Never one the page already shows, should the hour's cache have turned over in between.
      .then((j: { cards: GridCard[] }) => {
        setRest(j.cards.filter((c) => c.kind === "tiles" && !have.has(c.key)));
        setState("idle");
      })
      .catch(() => setState("failed"));
  }, [own]);

  // The rest, read once the end of the first cards is within two screens or so.
  useEffect(() => {
    const el = end.current;
    if (!el || more <= 0 || rest || state !== "idle") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        load();
      },
      { rootMargin: "1600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [more, rest, state, load]);

  if (!own.length) return null;
  const at = own.findIndex((c) => c.kind === "weekly");
  const weekly = at >= 0 ? (own[at] as WeeklyCard) : null;
  const upper = at >= 0 ? own.slice(0, at) : [];
  const shown = [...(at >= 0 ? own.slice(at + 1) : own), ...(rest ?? [])];
  // Reached before the rest has come (a slow line): a row of blanks where it will be.
  const waiting = more > 0 && !rest && state === "reading";

  return (
    <section id="category-grid" aria-labelledby="category-grid-title" className="w-full bg-slate-50 px-3 pb-8 pt-5 sm:px-4 sm:pb-10 sm:pt-7 lg:px-5">
      <div className="mx-auto max-w-[1920px]">
        <div className="mb-2.5 flex items-baseline justify-between gap-4 sm:mb-3.5">
          <h2 id="category-grid-title" className="text-[19px] font-bold tracking-tight text-slate-900 sm:text-[22px]">
            Browse by category
          </h2>
          <Link href="/products/" className="shrink-0 text-[13px] font-semibold text-brand-dark hover:underline sm:text-sm">
            Browse all products
          </Link>
        </div>

        {upper.length > 0 && (
          <div className={GRID}>
            {upper.map((c) => (
              <GridItem key={c.key} card={c} />
            ))}
          </div>
        )}
        {weekly && <WeeklyBand card={weekly} onQuote={setQuote} className={upper.length ? BETWEEN : ""} />}
        <div className={`${GRID} ${upper.length || weekly ? BETWEEN : ""}`} aria-busy={waiting}>
          {shown.map((c) => (
            <GridItem key={c.key} card={c} />
          ))}
          {waiting &&
            [0, 1, 2, 3].map((i) => (
              <div key={i} aria-hidden="true" className={`${CARD} min-h-[300px] motion-safe:animate-pulse sm:min-h-[420px]`}>
                <span className="h-4 w-2/3 rounded bg-slate-100" />
                <span className="grid grid-cols-2 content-start gap-2 sm:gap-3">
                  {[0, 1, 2, 3].map((j) => (
                    <span key={j} className={`aspect-square ${PICTURE_CORNER} bg-slate-100`} />
                  ))}
                </span>
                <span className="h-3 w-1/2 self-end rounded bg-slate-100" />
              </div>
            ))}
        </div>
        <div ref={end} />

        {state === "failed" && (
          <p className="mt-5 text-center text-[13.5px] text-slate-600 sm:mt-6">
            {"The rest of the categories didn’t load. "}
            <button type="button" onClick={load} className={`font-semibold text-brand-dark underline underline-offset-[3px] ${FOCUS}`}>
              Try again
            </button>
          </p>
        )}
      </div>

      {quote && (
        <InquiryModal
          product={{ id: quote.id, name: quote.name, imageUrl: quote.image, images: [quote.image], categoryRef: { name: quote.category } }}
          onClose={() => setQuote(null)}
        />
      )}
    </section>
  );
}

function GridItem({ card }: { card: GridCard }) {
  if (card.kind === "ranked") return <RankedView card={card} />;
  if (card.kind === "tiles") return <TilesView card={card} />;
  return null;
}

/** A family or a group: its four biggest categories, and the way to all of it. */
function TilesView({ card }: { card: TilesCard }) {
  return (
    <article className={CARD}>
      <header className="min-w-0">
        <h3 className="line-clamp-2 text-[13.5px] font-bold leading-[1.25] text-slate-900 sm:text-[17px]">{card.title}</h3>
        <p className="mt-0.5 hidden truncate text-[12.5px] text-slate-500 sm:block">{card.subtitle}</p>
      </header>
      <ul className="grid grid-cols-2 content-start gap-x-2 gap-y-2.5 sm:gap-x-3 sm:gap-y-3">
        {card.tiles.map((tile) => (
          <li key={tile.id} className="min-w-0">
            <CategoryTile tile={tile} />
          </li>
        ))}
      </ul>
      <footer className="self-end pt-0.5">
        {/* As a shop's card says it. No count: numbers on every card read as clutter (the owner, 2026-10-08). */}
        <Link href={card.href} className={MORE_LINK} aria-label={`See more in ${card.title}`}>
          <span className="truncate">See more</span>
          <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
        </Link>
      </footer>
    </article>
  );
}

/** What buyers asked us to source most: the first with its picture large, the next four as a list, numbered. */
function RankedView({ card }: { card: RankedCard }) {
  const [top, ...next] = card.tiles;
  return (
    <article className={`${CARD} col-span-2`}>
      <header className="min-w-0">
        <h3 className="truncate text-[15px] font-bold leading-tight text-slate-900 sm:text-[17px]">Most requested by buyers</h3>
        <p className="mt-0.5 truncate text-[12px] text-slate-500 sm:text-[12.5px]">By quote requests in the last {card.days} days</p>
      </header>
      {/* The first beside the other four, which share its height in four even rows, a hairline between them. */}
      <ol className="grid grid-cols-2 grid-rows-4 gap-x-3 sm:gap-x-5">
        <li className="row-span-4 min-w-0">
          <TopRank tile={top} />
        </li>
        {next.map((tile, i) => (
          <li key={tile.id} className={`min-w-0 py-1 ${i ? "border-t border-slate-100" : ""}`}>
            <Link href={`/products/?categoryId=${tile.id}`} className={`group flex h-full min-w-0 items-center gap-2 rounded-lg sm:gap-3 ${FOCUS}`}>
              <Rank n={i + 2} />
              <span
                className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-lg ${GROUND} sm:h-14 sm:w-14 xl:h-16 xl:w-16 min-[100rem]:h-20 min-[100rem]:w-20 min-[112.5rem]:h-24 min-[112.5rem]:w-24`}
              >
                <Image src={src(tile.image, 200)} alt="" fill sizes="96px" className="object-cover mix-blend-multiply transition-transform duration-500 ease-out group-hover:scale-[1.06]" />
              </span>
              <span className="line-clamp-2 min-w-0 text-[13px] font-medium leading-snug text-slate-800 transition-colors group-hover:text-brand-dark sm:text-[14.5px] min-[100rem]:text-[15.5px]">
                {tile.name}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <footer className="self-end pt-0.5">
        <Link href="/contact/" className={MORE_LINK}>
          <span className="truncate">Ask us to source something else</span>
          <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
        </Link>
      </footer>
    </article>
  );
}

function TopRank({ tile }: { tile: GridCategoryTile }) {
  const frames = [tile.image, ...tile.previews];
  const hover = useHoverPreview(frames.length);
  return (
    <Link href={`/products/?categoryId=${tile.id}`} className={`group flex h-full min-w-0 flex-col ${PICTURE_CORNER} ${FOCUS}`} onPointerEnter={hover.onPointerEnter} onPointerLeave={hover.onPointerLeave}>
      {/* As tall as the list beside it lets it be. */}
      <Frames frames={frames} frame={hover.frame} armed={hover.armed} px={480} sizes="(max-width: 1024px) 45vw, 25vw" className="min-h-[136px] flex-1" />
      <span className="mt-2 flex min-w-0 items-center gap-2">
        <Rank n={1} />
        <span className="line-clamp-2 min-w-0 text-[13.5px] font-semibold leading-snug text-slate-900 transition-colors group-hover:text-brand-dark sm:text-[15.5px]">{tile.name}</span>
      </span>
    </Link>
  );
}

/** A place in the ranking: the first in the brand's colour, the rest quieter. */
function Rank({ n }: { n: number }) {
  return (
    <span
      className={`w-[1.1em] shrink-0 text-center font-extrabold leading-none tabular-nums ${n === 1 ? "text-[28px] text-brand-dark sm:text-[32px]" : "text-[20px] text-slate-400 sm:text-[24px]"}`}
    >
      {n}
    </span>
  );
}

/** This week's picks: a band across the grid, its name on the brand's colour, eight products beside it (in a row to swipe, on a phone). */
function WeeklyBand({ card, onQuote, className }: { card: WeeklyCard; onQuote: (t: GridProductTile) => void; className: string }) {
  return (
    <article aria-labelledby="weekly-picks-title" className={`liquid-glass-card flex min-w-0 flex-col overflow-hidden xl:flex-row ${className}`}>
      <header className="flex items-center justify-between gap-3 bg-brand-dark px-3 py-2.5 text-white sm:px-4 sm:py-3 xl:w-[232px] xl:shrink-0 xl:flex-col xl:items-start xl:justify-between xl:p-5">
        <div className="min-w-0">
          <h3 id="weekly-picks-title" className="text-[16px] font-bold leading-tight sm:text-[18px] xl:text-[20px]">
            {"This week’s picks"}
          </h3>
          {/* One line beside the products' row; at a desk, the week on a line of its own. */}
          <p className="mt-0.5 text-[12px] text-white/80 sm:text-[13px] xl:mt-3 xl:flex xl:flex-col xl:gap-0.5">
            <span className="font-semibold text-white xl:text-[15px]">{card.span}</span>
            <span className="xl:hidden">{" · "}</span>
            <span>New picks every Monday</span>
          </p>
        </div>
        <Link
          href="/products/"
          className="inline-flex shrink-0 items-center gap-0.5 text-[12.5px] font-semibold text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:text-[13px] xl:rounded-md xl:bg-white xl:px-3.5 xl:py-2 xl:text-brand-dark xl:hover:bg-slate-100 xl:hover:no-underline"
        >
          {"Browse all"}
          <span className="hidden xl:inline">{" products"}</span>
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </header>
      <ul className="flex min-w-0 flex-1 snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto p-3 [scrollbar-width:none] sm:scroll-px-4 sm:gap-4 sm:p-4 lg:grid lg:grid-cols-8 lg:gap-3 lg:overflow-visible xl:gap-4 [&::-webkit-scrollbar]:hidden">
        {card.tiles.map((tile) => (
          <li key={tile.id} className="w-[38%] max-w-[170px] shrink-0 snap-start sm:w-[150px] lg:w-auto lg:max-w-none">
            <PickTile tile={tile} onQuote={onQuote} />
          </li>
        ))}
      </ul>
    </article>
  );
}

/**
 * A tile's picture, and while a mouse rests on it, more of what it holds in
 * turn: a group's other products, a product's other photos. The extra
 * pictures are not asked for until then, and nothing moves for someone who
 * asked for less motion.
 */
function useHoverPreview(count: number) {
  const [frame, setFrame] = useState(0);
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);
  const onPointerEnter = (e: React.PointerEvent) => {
    if (count < 2 || e.pointerType !== "mouse" || stillPlease()) return;
    setArmed(true);
    stop();
    const step = (delay: number) => {
      timer.current = setTimeout(() => {
        setFrame((f) => (f + 1) % count);
        step(1100);
      }, delay);
    };
    step(350);
  };
  const onPointerLeave = () => {
    stop();
    setFrame(0);
  };
  return { frame, armed, onPointerEnter, onPointerLeave };
}

function Frames({
  frames,
  frame,
  armed,
  px,
  sizes,
  fit = "cover",
  className = "aspect-square",
}: {
  frames: string[];
  frame: number;
  armed: boolean;
  px: number;
  sizes: string;
  fit?: "cover" | "contain";
  className?: string;
}) {
  return (
    <span className={`relative block overflow-hidden ${PICTURE_CORNER} ${GROUND} ${className}`}>
      {frames.map((url, i) =>
        i === 0 || armed ? (
          // Each picture on a ground of its own, so it melts into that and not into the one fading out under it.
          <span key={url} className={`absolute inset-0 isolate ${GROUND} transition-opacity duration-500 ease-out ${i === frame ? "opacity-100" : "opacity-0"}`}>
            <Image
              src={src(url, px)}
              alt=""
              fill
              sizes={sizes}
              className={`${fit === "contain" ? "object-contain p-[5%]" : "object-cover"} mix-blend-multiply transition-transform duration-500 ease-out group-hover:scale-[1.04]`}
            />
          </span>
        ) : null,
      )}
    </span>
  );
}

function CategoryTile({ tile }: { tile: GridCategoryTile }) {
  const frames = [tile.image, ...tile.previews];
  const hover = useHoverPreview(frames.length);
  return (
    <Link href={`/products/?categoryId=${tile.id}`} className={`group block ${PICTURE_CORNER} ${FOCUS}`} onPointerEnter={hover.onPointerEnter} onPointerLeave={hover.onPointerLeave}>
      <Frames frames={frames} frame={hover.frame} armed={hover.armed} px={320} sizes="(max-width: 1024px) 22vw, 12vw" />
      {/* Its name and nothing else, with room held for two lines, so every tile of a row is one height. */}
      <span className="mt-1.5 line-clamp-2 min-h-[2lh] text-[11.5px] font-medium leading-[1.25] text-slate-800 transition-colors group-hover:text-brand-dark sm:mt-2 sm:text-[13.5px]">
        {tile.name}
      </span>
    </Link>
  );
}

function PickTile({ tile, onQuote }: { tile: GridProductTile; onQuote: (t: GridProductTile) => void }) {
  const frames = [tile.image, ...tile.previews];
  const hover = useHoverPreview(frames.length);
  return (
    <div className="group relative" onPointerEnter={hover.onPointerEnter} onPointerLeave={hover.onPointerLeave}>
      <Link href={`/products/${tile.id}/`} className={`block ${PICTURE_CORNER} ${FOCUS}`}>
        <Frames frames={frames} frame={hover.frame} armed={hover.armed} px={320} fit="contain" sizes="(max-width: 1024px) 150px, 11vw" />
        <span className="mt-2 line-clamp-2 text-[12.5px] leading-snug text-slate-800 transition-colors group-hover:text-brand-dark sm:text-[13px]">{tile.name}</span>
        {tile.category && <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">{tile.category}</span>}
      </Link>
      {/* Over the picture, beside the link rather than inside it (a button inside a link is not allowed). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square">
        <button
          type="button"
          onClick={() => onQuote(tile)}
          aria-label={`Request a quote for ${tile.name}`}
          className="pointer-events-auto absolute bottom-1.5 right-1.5 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-bold text-brand-dark shadow-sm ring-1 ring-slate-900/10 transition-all hover:bg-brand-dark hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
        >
          Get a quote
        </button>
      </div>
    </div>
  );
}
