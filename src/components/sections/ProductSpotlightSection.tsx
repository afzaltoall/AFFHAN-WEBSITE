"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronRight } from "lucide-react";
import { Picture, useNear } from "@/components/ui/SizedPicture";
import type { Spotlight, SpotlightProduct, SpotlightShelf } from "@/lib/homeGrid";

const InquiryModal = dynamic(() => import("@/components/ui/InquiryModal").then((m) => m.InquiryModal), { ssr: false });

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50";
const ON_DARK_FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";
/** Where Amazon's strip says "Bestsellers", the category: the one label here that is always true. */
const STRIP = "absolute bottom-2 left-0 max-w-[88%] truncate rounded-r-sm bg-[linear-gradient(90deg,#f2d98a,#fbeec4)] py-0.5 pl-2 pr-2.5 text-[11.5px] font-semibold text-slate-900";
/** The widths each picture is offered at (SizedPicture): 440 and 360 are the ones the band always fetched, already made at the edge. */
const ROW_WIDTHS = [240, 320, 440] as const;
const SHELF_WIDTHS = [160, 240, 360] as const;

/**
 * The homepage's spotlight band. It was a card-stack carousel under an
 * eyebrow and a poster heading, with one sentence written for every product
 * ("Sourced from vetted ... suppliers"), which the owner said read as made by
 * a machine (2026-10-08). Now it does what Flipkart's "Spotlight's on" and
 * Amazon's themed cards do: a band in the brand's colour, one family of the
 * catalogue a day, its products on a white panel with the way to a quote
 * where a shop would print a price, and under them its shelves, a branch of
 * the family each. lib/homeGrid.ts (getSpotlight) picks them all.
 *
 * Twelve in the window (two rows of six at a desk, a row to swipe on a
 * phone), since 2026-10-11: the owner found six "looking less" for a
 * catalogue of 10 lakh. The shelves are Amazon's 2x2 cards: a branch each,
 * four of its kinds, each named under its picture and the way to its own
 * category. They were six products each, under category strips and names cut
 * to a line, and at four shelves across every label was cut short: the owner
 * found them clumsy (2026-10-11). Two shelves across from a tablet, four from
 * 1280px; on a laptop, where two share the width, three of a shelf's kinds sit
 * in a row.
 *
 * No product counts: a bare "19,020" on the link read as a price, and a count
 * at all read as clutter (the owner, 2026-10-08); the line under the name
 * says what the family holds instead. "Get a quote" asks
 * about that product; the old band's one button asked about the first product,
 * whichever was showing. Nothing here shows a price.
 */
export function ProductSpotlightSection({ spotlight }: { spotlight: Spotlight | null }) {
  const [quote, setQuote] = useState<SpotlightProduct | null>(null);
  const [ref, near] = useNear<HTMLElement>();
  if (!spotlight || spotlight.products.length < 4) return null;
  const { title, subtitle, href, products, shelves } = spotlight;
  return (
    <section ref={ref} aria-labelledby="spotlight-title" className="w-full bg-white px-3 pb-12 sm:px-4 sm:pb-16 lg:px-5">
      <div className="mx-auto max-w-[1920px]">
        <div className="overflow-hidden rounded-lg bg-[linear-gradient(100deg,#10505f_0%,#176579_55%,#1d7f95_100%)] p-2 sm:p-3">
          <div className="flex items-center justify-between gap-4 px-2 pb-3 pt-2 text-white sm:px-2.5 sm:pb-4 sm:pt-2.5">
            <div className="min-w-0">
              <h2 id="spotlight-title" className="text-[20px] font-bold leading-tight tracking-tight sm:text-[24px]">
                {`Spotlight on ${title}`}
              </h2>
              <p className="mt-1 text-[13px] font-medium leading-snug text-white/85 sm:text-[14.5px]">{`${subtitle} · A new spotlight every day`}</p>
            </div>
            <Link href={href} className={`inline-flex shrink-0 items-center gap-0.5 rounded-sm text-[14px] font-semibold text-white hover:underline sm:text-[15px] ${ON_DARK_FOCUS}`}>
              See all
              <ChevronRight size={17} aria-hidden="true" />
            </Link>
          </div>
          {/* A row to swipe on a phone; two rows of six from a laptop up. scroll-px: snapping lines the first
              product up with the panel's padding, not its edge. */}
          <ul className="flex snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto rounded-md bg-white p-3 [scrollbar-width:none] sm:scroll-px-4 sm:gap-4 sm:p-4 lg:grid lg:grid-cols-6 lg:gap-y-6 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
            {products.map((p) => (
              <li key={p.id} className="w-[44%] max-w-[220px] shrink-0 snap-start sm:w-[30%] lg:w-auto lg:max-w-none">
                <Tile p={p} near={near} onQuote={setQuote} />
              </li>
            ))}
          </ul>
          {/* The shelves: a row to swipe on a phone, as Amazon's app shows these cards (two to a row there left
              room for neither their names nor their pictures), two across from a tablet, four in a row from
              1280px. Two rows of this grid each (subgrid), so a title on two lines moves its neighbours'
              pictures down with it and every row of pictures stays level. */}
          {shelves.length > 0 && (
            <ul
              className={`mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto [scrollbar-width:none] sm:mt-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible [&::-webkit-scrollbar]:hidden ${shelves.length === 4 ? "xl:grid-cols-4" : ""}`}
            >
              {shelves.map((s) => (
                <Shelf key={s.href} shelf={s} near={near} fourAcross={shelves.length === 4} />
              ))}
            </ul>
          )}
        </div>
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

function Tile({ p, near, onQuote }: { p: SpotlightProduct; near: boolean; onQuote: (p: SpotlightProduct) => void }) {
  return (
    <div className="group flex h-full flex-col">
      <Link href={`/products/${p.id}/`} className={`block rounded-md ${FOCUS}`}>
        {/* The photo's white melts into the ground (multiply), so six shots from six suppliers read as one set. */}
        <span className="relative isolate block aspect-square overflow-hidden rounded-md bg-[#f1f4f5]">
          <Picture
            url={p.image}
            widths={ROW_WIDTHS}
            sizes="(min-width: 1024px) 15vw, (min-width: 640px) 30vw, 44vw"
            near={near}
            className="object-contain p-[6%] mix-blend-multiply transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.04]"
          />
          {p.category && <span className={STRIP}>{p.category}</span>}
        </span>
        <span className="mt-2 line-clamp-2 min-h-[2lh] text-[13px] leading-snug text-slate-800 transition-colors group-hover:text-brand-dark sm:text-[13.5px]">{p.name}</span>
      </Link>
      <button
        type="button"
        onClick={() => onQuote(p)}
        aria-label={`Get a quote for ${p.name}`}
        className={`mt-1.5 inline-flex w-fit items-center gap-0.5 rounded-sm text-[13.5px] font-bold text-brand-dark hover:underline sm:text-[14px] ${FOCUS}`}
      >
        Get a quote
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * A shelf: a branch of the family as a card of its own on the band, its name
 * the way to all of it, and four of its kinds, each a picture on white with
 * its name under it, and the way to its own category. Nothing on the picture
 * and nothing cut short: a name gets two lines, and every name keeps room for
 * two, so the pictures line up from shelf to shelf.
 */
function Shelf({ shelf, near, fourAcross }: { shelf: SpotlightShelf; near: boolean; fourAcross: boolean }) {
  return (
    <li className="flex w-[80%] max-w-[340px] shrink-0 snap-start flex-col gap-2.5 rounded-md bg-white/[0.08] p-3 ring-1 ring-inset ring-white/10 sm:row-span-2 sm:grid sm:w-auto sm:max-w-none sm:grid-rows-subgrid sm:gap-3 sm:p-3.5">
      <h3 className="min-w-0">
        <Link href={shelf.href} className={`group/title flex items-start justify-between gap-2 rounded-sm text-white ${ON_DARK_FOCUS}`}>
          <span className="line-clamp-2 text-[16px] font-bold leading-tight sm:text-[17px]">{shelf.title}</span>
          <ChevronRight size={18} className="mt-px shrink-0 transition-transform group-hover/title:translate-x-0.5" aria-hidden="true" />
        </Link>
      </h3>
      {/* On a laptop, where two shelves share the width, three in a row: four there left 103px a picture,
          too narrow for a name in two lines. */}
      <ul className={`grid grid-cols-2 gap-x-2.5 gap-y-3 sm:gap-x-3 lg:grid-cols-3 ${fourAcross ? "xl:grid-cols-2" : "xl:grid-cols-4"}`}>
        {shelf.kinds.map((k, i) => (
          <li key={k.href} className={`min-w-0 ${i === 3 ? "lg:max-xl:hidden" : ""}`}>
            <Link href={k.href} className={`group block rounded-md ${ON_DARK_FOCUS}`}>
              <span className="relative block aspect-square overflow-hidden rounded-md bg-white">
                <Picture
                  url={k.image}
                  widths={SHELF_WIDTHS}
                  sizes="(min-width: 1920px) 212px, (min-width: 1280px) calc(12.5vw - 32px), (min-width: 1024px) calc(16.7vw - 30px), (min-width: 640px) calc(25vw - 37px), 31vw"
                  near={near}
                  className="object-contain p-[8%] transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.04]"
                />
              </span>
              <span className="mt-1.5 line-clamp-2 min-h-[2lh] text-[13px] font-medium leading-snug text-white/90 transition-colors group-hover:text-white sm:text-[13.5px]">
                {k.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
}

export default ProductSpotlightSection;
