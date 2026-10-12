"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { parseDescription } from "@/lib/productDescription";
import { ProductCard, type ProductCardData } from "@/components/ui/ProductCard";
import { InquiryModal } from "@/components/ui/InquiryModal";
import { SaveProductButton } from "@/components/ui/SaveProductButton";
import type { RelatedCategory } from "@/lib/homeGrid";

export interface PDPProduct {
  id: number;
  name: string;
  imageUrl: string | null;
  images: string[];
  description: string | null;
  categoryName: string | null;
  categoryId: string | null;
  /**
   * Our own reference, built from the internal row id — NEVER the `sku` column.
   *
   * Every SKU in the catalogue begins with "CJ" (measured: 1,068,225 of
   * 1,068,225). Printing one on a public page names the supplier on every
   * product we list, and anyone can paste it into that supplier's own site to
   * pull up the item and its price — the single thing this business has
   * decided must never be visible, because their dollar price is not our
   * quote. The internal id gives a buyer something equally unambiguous to
   * quote back and gives away nothing.
   */
  reference: string;
  /**
   * Root first, this product's own category last — the full trail.
   *
   * The breadcrumb used to render "Home › Earrings › <product>" from
   * `categoryName` alone, skipping every level above the leaf, while the
   * JSON-LD BreadcrumbList on the same page published the complete path. The
   * page was telling Google one thing and the reader another, and the data to
   * fix it was already being fetched for the schema block. Empty when the
   * product has no category, or its category is moderation-blocked.
   */
  categoryPath: { id: string; name: string }[];
}

/**
 * How it is sourced, true of every product: the rows of the details table
 * after its own specifications (EPROLO's), and all of it for CJ's, which come
 * with none. They replaced a sentence printed on every product ("This is a
 * reference product, not stock we hold...") and four numbered steps with
 * icons ("What happens after you ask"), both of which read to the owner as
 * made by a machine (2026-10-11). The minimum order line was the quote box's.
 */
const SOURCING: [string, string][] = [
  ["Place of origin", "China"],
  ["Customisation", "Your logo, colours, packaging or size"],
  ["Minimum order", "Set by the factory, confirmed with your quote"],
  ["Quality check", "Inspected before it leaves China"],
  ["Shipping", "Sea or air, cleared through customs to your door"],
];

/** A phone shows half the similar products: twelve rows of two were enough before the footer. */
const SIMILAR_ON_A_PHONE = 12;

/**
 * A list that fills what is left of its column with whole rows, and only
 * whole rows: from 1024px, where the gallery sets the height of the row
 * beside it, it takes the column's leftover height (it contributes none of its
 * own), wraps the rows that do not fit into a second column it clips, and
 * grows the rest into the height left over. So the column ends level with the gallery, however
 * long the product's name, with no empty space under it and no row cut in
 * half (the owner, 2026-10-11, of the space under the quote box and under the
 * steps). Below 1024px it is an ordinary list. The rows it leaves out are made
 * inert, so the keyboard and screen readers skip what cannot be seen.
 *
 * Its first item is an empty spacer: a flex line always holds at least one
 * item, so without it a first row taller than the space left would show cut in
 * half instead of wrapping out of sight.
 */
const FILL = "relative flex-col lg:min-h-0 lg:flex-1 lg:basis-0 lg:flex-wrap lg:overflow-hidden";
const FILL_ROW = "w-full shrink-0 lg:grow";
/** How far a row beside the quote box may grow: a little, so a list that runs out of rows is not spread thin. */
const GROW_CAP = ["lg:max-h-[124px]", "lg:max-h-[92px]"] as const;
const Spacer = () => <li aria-hidden="true" className="h-0 w-full shrink-0" />;
function useClippedInert<T extends HTMLElement>(given?: RefObject<T | null>) {
  const own = useRef<T>(null);
  const ref = given ?? own;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = () => {
      const width = el.clientWidth;
      for (const child of Array.from(el.children) as HTMLElement[]) child.inert = child.offsetLeft >= width;
    };
    mark();
    const ro = new ResizeObserver(mark);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return ref;
}

/**
 * The product column, flush with the gallery: the related categories take the
 * whole rows they can of the height left under the details (FILL), and the
 * details table takes what is left after them, at most 8px a row above and
 * below its text. A first row of categories needs about 80px, and on a 1366 or
 * 1440px screen less than that was often left: it stood empty. Measured with
 * the table at its own height and in fractions of a pixel, a pixel to spare: a
 * row given exactly its own height could be a fraction short of it and wrap
 * out of sight (it did at 1280x720). So it is idempotent, and the
 * ResizeObserver it runs on settles at once; from 1024px, where the columns sit
 * side by side.
 */
function useFlushDetails(column: RefObject<HTMLDivElement | null>, table: RefObject<HTMLDListElement | null>, list: RefObject<HTMLUListElement | null>) {
  useEffect(() => {
    const col = column.current;
    const dl = table.current;
    if (!col || !dl) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    let frame = 0;
    const settle = () => {
      const ul = list.current;
      const rows = dl.children.length;
      const before = dl.style.getPropertyValue("--pad");
      let next = 0;
      if (wide.matches && ul && rows) {
        dl.style.setProperty("--pad", "0px");
        const top = col.getBoundingClientRect().top;
        const room = col.getBoundingClientRect().height - (ul.getBoundingClientRect().top - top);
        let used = 0;
        for (const li of Array.from(ul.children) as HTMLElement[]) {
          if (li.getAttribute("aria-hidden") === "true") continue;
          const h = li.getBoundingClientRect().height;
          if (used + h > room - 1) break;
          used += h;
        }
        next = Math.min(Math.max(0, Math.floor(room - used - 1)), rows * 16);
      }
      const pad = `${next / Math.max(1, rows) / 2}px`;
      if (pad !== before || dl.style.getPropertyValue("--pad") !== pad) dl.style.setProperty("--pad", pad);
    };
    settle();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(settle);
    });
    ro.observe(col);
    if (list.current) ro.observe(list.current);
    wide.addEventListener("change", settle);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      wide.removeEventListener("change", settle);
    };
  }, [column, table, list]);
}

/** The categories beside this one, two to a row, each its picture and its name; the heading travels with the first row. */
function RelatedCategories({ categories, listRef }: { categories: RelatedCategory[]; listRef: RefObject<HTMLUListElement | null> }) {
  const ref = useClippedInert<HTMLUListElement>(listRef);
  const rows: RelatedCategory[][] = [];
  for (let i = 0; i < categories.length; i += 2) rows.push(categories.slice(i, i + 2));
  return (
    <ul ref={ref} aria-label="Related categories" className={`hidden lg:flex ${FILL} mt-4`}>
      <Spacer />
      {rows.map((row, i) => (
        <li key={row[0].id} className="w-full shrink-0 pb-2">
          {i === 0 && <h2 className="mb-1.5 text-[13.5px] font-bold leading-5 text-[#081f2a]">Related categories</h2>}
          <div className="grid grid-cols-2 gap-2">
            {row.map((c) => (
              <Link
                key={c.id}
                href={`/products/?categoryId=${encodeURIComponent(c.id)}`}
                className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white p-1 pr-2.5 transition-colors hover:border-[#27a8c4]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27a8c4]/40"
              >
                <span className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-[#f1f4f5]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a 36px picture; next/image writes no srcset here (unoptimized) and adds nothing. */}
                  <img src={getCdnUrl(c.image, 96) as string} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                </span>
                <span className="truncate text-[13px] font-medium text-slate-700 group-hover:text-[#176579]">{c.name}</span>
              </Link>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Products of the same category beside the quote box, as Amazon lists them under its buy box: a picture, a name, the way to a quote. */
function MoreInCategory({ title, products, onQuote }: { title: string; products: ProductCardData[]; onQuote: (p: ProductCardData) => void }) {
  const ref = useClippedInert<HTMLUListElement>();
  return (
    <ul ref={ref} aria-label={title} className={`hidden lg:flex ${FILL} mt-5`}>
      <Spacer />
      {products.map((p, i) => (
        <li key={p.id} className={`${FILL_ROW} ${GROW_CAP[i === 0 ? 0 : 1]}`}>
          {i === 0 && <h2 className="mb-1 text-[14px] font-bold leading-5 text-[#081f2a]">{title}</h2>}
          <div className="flex items-center gap-3 border-b border-slate-200/70 py-2.5">
            <Link href={`/products/${p.id}/`} className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-[#f1f4f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27a8c4]/40">
              {p.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- a 64px picture; next/image writes no srcset here (unoptimized) and adds nothing.
                <img src={getCdnUrl(p.imageUrl, 160) as string} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain p-1 mix-blend-multiply" />
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/products/${p.id}/`} className="line-clamp-2 text-[13px] leading-snug text-slate-800 hover:text-[#176579]">
                {p.name}
              </Link>
              <button
                type="button"
                onClick={() => onQuote(p)}
                aria-label={`Get a quote for ${p.name}`}
                className="mt-1 inline-flex items-center gap-0.5 rounded-sm text-[12.5px] font-bold text-[#176579] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27a8c4]/40"
              >
                Get a quote
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  product: PDPProduct;
  similar: ProductCardData[];
  related: RelatedCategory[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ModalProduct = any;

export function ProductDetailView({ product, similar, related }: Props) {
  const gallery = product.images.length ? product.images : product.imageUrl ? [product.imageUrl] : [];
  // Supplier HTML, read rather than printed. See src/lib/productDescription.ts.
  const parsed = parseDescription(product.description);
  const [active, setActive] = useState(0);
  const [inquiry, setInquiry] = useState<ModalProduct | null>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDListElement>(null);
  const relatedRef = useRef<HTMLUListElement>(null);
  useFlushDetails(columnRef, tableRef, relatedRef);

  const openMainInquiry = () =>
    setInquiry({
      id: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      images: gallery,
      categoryRef: { name: product.categoryName },
    });
  const quoteOther = (p: ProductCardData) => setInquiry({ ...p, images: p.imageUrl ? [p.imageUrl] : [] });

  const mainSrc = gallery[active] ? (getCdnUrl(gallery[active], 1024) as string) : null;
  // From 1280px the main picture takes the screen's height, between square and 1.4 times its width, so the gallery
  // held in view beside a long product reaches the screen's foot instead of leaving it empty under the picture
  // (the owner, 2026-10-11). Its width is the column's (cqw), less the thumbnails down its side from 1536px; the
  // height leaves the navbar and its gap (112px), 24px under it, and the thumbnails' row below it where they are.
  const tall =
    gallery.length > 1
      ? "xl:aspect-auto xl:h-[clamp(100cqw,calc(100vh-212px),140cqw)] 2xl:h-[clamp(calc(100cqw-76px),calc(100vh-136px),calc(140cqw-106px))]"
      : "xl:aspect-auto xl:h-[clamp(100cqw,calc(100vh-136px),140cqw)]";
  const leaf = product.categoryPath[product.categoryPath.length - 1] ?? (product.categoryId && product.categoryName ? { id: product.categoryId, name: product.categoryName } : null);

  // The details: the product's own specifications first (EPROLO's), then how it is sourced, then the reference.
  const details: [string, ReactNode][] = [
    ...(parsed?.specs ?? []).slice(0, 12).map((s): [string, ReactNode] => [s.label, s.value]),
    ...(leaf
      ? [
          [
            "Category",
            <Link key="category" href={`/products/?categoryId=${encodeURIComponent(leaf.id)}`} className="font-medium text-[#176579] hover:underline">
              {leaf.name}
            </Link>,
          ] as [string, ReactNode],
        ]
      : []),
    ...SOURCING,
    ["Quote reference", <span key="reference" className="font-semibold tracking-wide">{product.reference}</span>],
  ];

  // Twenty-four under the product (twelve, or what there is, for a small category), whole rows at every width, and
  // up to sixteen of the rest beside the quote box, as many as its column has room for; never one twice.
  const underCount = similar.length >= 24 ? 24 : similar.length >= 12 ? 12 : similar.length;
  const under = similar.slice(0, underCount);
  const beside = similar.slice(underCount, underCount + 16);

  return (
    <main className="min-h-screen bg-slate-50 pt-24 pb-16">
      {/* The page's full width, as the homepage and the catalogue have it
          (1920px), laid out as Amazon lays out a product: the gallery, the
          product, and the quote box beside them. Three columns from 1280px;
          on a laptop the quote box goes under the product, beside the
          gallery; below 1024px it is one column. */}
      <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        {/* The full trail, matching the JSON-LD on this page and the crumb strip
            on /products — which both start at "All Categories". A product three
            levels deep now reads
            All Categories › Jewelry & Watches › Fashion Jewelry › Earrings › <product>
            instead of collapsing the middle two away. */}
        <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          {/* Trailing slash. next.config sets trailingSlash: true, so "/products"
              costs every visitor a 308 to "/products/" — and the BreadcrumbList
              on this page has always said "/products/", so the visible trail and
              the schema disagreed by exactly one character. */}
          <Link href="/products/" className="hover:text-[#176579]">
            All Categories
          </Link>
          {(product.categoryPath.length
            ? product.categoryPath
            : product.categoryId && product.categoryName
              ? [{ id: product.categoryId, name: product.categoryName }]
              : []
          ).map((step) => (
            <span key={step.id} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5" />
              <Link href={`/products/?categoryId=${encodeURIComponent(step.id)}`} className="hover:text-[#176579]">
                {step.name}
              </Link>
            </span>
          ))}
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="max-w-[60vw] truncate font-medium text-slate-700 sm:max-w-none">{product.name}</span>
        </nav>

        {/* On a laptop (1024 to 1279px) the quote box sits under the gallery, as Flipkart has its buttons, and the
            product fills the other column to the same height (its second row takes what the product needs
            beyond the gallery, 1fr); from 1280px, three columns. */}
        <div className="grid gap-8 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-10 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)] xl:grid-rows-[auto] xl:gap-8 2xl:gap-10">
          {/* Gallery: the pictures under the main one, and down its side from 1536px, as Amazon has them; held in
              view from 1280px while a longer product beside it scrolls. Pointing at one shows it; a tap or a press
              chooses it. */}
          <div className="min-w-0 lg:col-start-1 lg:row-start-1 xl:sticky xl:top-28 xl:self-start xl:@container">
            <div className="flex flex-col gap-3 2xl:flex-row-reverse 2xl:items-start">
              <div className={`relative aspect-square w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm 2xl:flex-1 ${tall}`}>
                {mainSrc ? (
                  <Image
                    src={mainSrc}
                    alt={product.name}
                    fill
                    sizes="(min-width: 1280px) 40vw, (min-width: 1024px) 45vw, 100vw"
                    className="object-contain p-4"
                    priority
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-slate-300">No image available</div>
                )}
              </div>

              {gallery.length > 1 && (
                <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] 2xl:max-h-[clamp(calc(100cqw-76px),calc(100vh-136px),calc(140cqw-106px))] 2xl:flex-col 2xl:overflow-y-auto 2xl:overflow-x-visible 2xl:pb-0 [&::-webkit-scrollbar]:hidden">
                  {gallery.slice(0, 8).map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setActive(i)}
                      onMouseEnter={() => setActive(i)}
                      aria-label={`View image ${i + 1}`}
                      aria-pressed={i === active}
                      className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-white transition-all ${
                        i === active ? "border-[#27a8c4] ring-2 ring-[#27a8c4]/25" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <Image src={getCdnUrl(img, 128) as string} alt="" fill sizes="64px" className="object-contain p-1" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* The product: its name, what it says of itself (EPROLO's), its details, and the categories beside it,
              which fill the column to the gallery's foot. No category chip over the name: a label over a poster
              heading is the look the owner rejects (2026-10-08). */}
          <div ref={columnRef} className="relative flex min-w-0 flex-col lg:col-start-2 lg:row-span-2 lg:row-start-1 xl:row-span-1">
            <h1 className="text-[22px] font-bold leading-snug tracking-tight text-[#081f2a] sm:text-[26px]">{product.name}</h1>

            {parsed && parsed.paragraphs.length > 0 && (
              <div className="mt-4 space-y-2">
                {parsed.paragraphs.slice(0, 4).map((text) => (
                  <p key={text} className="text-sm leading-relaxed text-slate-600 sm:text-[15px]">
                    {text}
                  </p>
                ))}
              </div>
            )}

            <h2 className="mt-5 text-[14px] font-bold text-[#081f2a]">Product details</h2>
            <dl ref={tableRef} className="mt-2.5 divide-y divide-slate-200/70 overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-[13.5px]">
              {details.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[116px_minmax(0,1fr)] items-center gap-3 px-4 py-[calc(0.625rem+var(--pad,0px))] sm:grid-cols-[140px_minmax(0,1fr)]">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="min-w-0 text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>

            {/* The supplier's size chart, when the description carried one.
                Scrolls inside its own box: these tables run to a dozen columns
                and must never widen the page. */}
            {parsed?.sizeChart && parsed.sizeChart.rows.length > 0 && (
              <div className="mt-6">
                <h2 className="mb-2.5 text-[14px] font-bold text-[#081f2a]">Size chart</h2>
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full border-collapse text-left text-xs sm:text-[13px]">
                    <thead className="bg-slate-50">
                      <tr>
                        {parsed.sizeChart.headers.map((h, i) => (
                          <th key={i} className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.sizeChart.rows.map((row, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          {row.map((c, j) => (
                            <td key={j} className="whitespace-nowrap px-3 py-2 text-slate-700">
                              {c}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-slate-500">Measurements as supplied by the factory. Final specification is confirmed with your quote.</p>
              </div>
            )}

            {related.length > 0 && <RelatedCategories categories={related} listRef={relatedRef} />}
          </div>

          {/* The quote box, where Amazon puts its buy box, and under it more of the same category, filling the
              column to the gallery's foot: beside the product from 1280px, under the gallery on a laptop, after
              the product below that (where the products wait for the rows under the page). */}
          <aside aria-label="Request a quote" className="flex min-w-0 flex-col lg:col-start-1 lg:row-start-2 xl:col-start-3 xl:row-start-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[15px] font-bold text-[#081f2a]">Sourced to order</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                There is no public price. Tell us how many you need and where they ship, and our team comes back with a quote.
              </p>
              <button
                onClick={openMainInquiry}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#27a8c4] to-[#176579] text-sm font-bold text-white shadow-[0_8px_24px_rgba(39,168,196,0.25)] transition-all duration-300 hover:from-[#176579] hover:to-[#081f2a] hover:shadow-[0_12px_32px_rgba(23,85,101,0.35)] hover:scale-[1.01] active:scale-[0.99]"
              >
                Request a Quote
                <ChevronRight className="h-4 w-4" />
              </button>
              {/* Save beside the quote: the decision being made here is "do I want this", and both answers belong
                  together. The button sizes itself; the box gives it the full width. */}
              <div className="mt-2.5 [&>button]:w-full">
                <SaveProductButton productId={product.id} />
              </div>
            </div>
            {beside.length > 0 && <MoreInCategory title={product.categoryName ? `More in ${product.categoryName}` : "More like this"} products={beside} onQuote={quoteOther} />}
          </aside>
        </div>

        {/* Similar products: twenty-four, which fills whole rows at two, three, four and six across (twelve on a
            phone). */}
        {under.length > 0 && (
          <section className="mt-14">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight text-[#081f2a] sm:text-xl">Similar products</h2>
              {product.categoryId && (
                <Link
                  href={`/products/?categoryId=${encodeURIComponent(product.categoryId)}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#176579] hover:opacity-80"
                >
                  View all <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-6">
              {under.map((p, i) => (
                <div key={p.id} className={`min-w-0 ${i >= SIMILAR_ON_A_PHONE ? "max-sm:hidden" : ""}`}>
                  <ProductCard product={p} onClick={() => quoteOther(p)} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {inquiry && <InquiryModal product={inquiry} onClose={() => setInquiry(null)} />}
    </main>
  );
}
