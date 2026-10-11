"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, FileText, Factory, ClipboardCheck, Ship } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { parseDescription } from "@/lib/productDescription";
import { ProductCard, type ProductCardData } from "@/components/ui/ProductCard";
import { InquiryModal } from "@/components/ui/InquiryModal";
import { SaveProductButton } from "@/components/ui/SaveProductButton";

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
  /** How many products sit in this category, for the "one of N" line. 0 when
   *  the product has no category. */
  categoryCount: number;
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
 * What actually happens after the button is pressed.
 *
 * This exists because the description field is empty for every CJ row — CJ's
 * list endpoint does not return one — so for those products the column had a
 * title, a notice and a button and nothing else. These four steps are the real
 * process rather than filler, and being static they are true of every product,
 * which no scraped copy would be.
 *
 * It is NOT true that the column is empty catalogue-wide. All 12,746 EPROLO
 * rows carry a description, and reading "empty for all 1,068,225 rows" as
 * "empty always" is what left those pages rendering raw HTML tags as visible
 * text. CJ is 1,068,225 of 1,080,971 rows — not all of them.
 */
const STEPS = [
  { Icon: FileText, title: "You send the request", body: "Quantity, the spec you need, and where it ships to." },
  { Icon: Factory, title: "We match a factory", body: "Our Guangzhou team sources it and checks the plant." },
  { Icon: ClipboardCheck, title: "Quality inspection", body: "Goods are inspected before they leave China." },
  { Icon: Ship, title: "Freight and customs", body: "Sea or air, cleared and delivered to your door." },
];

/** What happens after a buyer asks: the four steps, numbered. */
function Steps({ className }: { className: string }) {
  return (
    <div className={className}>
      <h2 className="mb-3.5 text-[13px] font-bold text-[#081f2a]">What happens after you ask</h2>
      <ol className="grid gap-3 sm:grid-cols-2">
        {STEPS.map(({ Icon, title, body }, i) => (
          <li key={title} className="flex gap-2.5">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#27a8c4]/10 text-[#176579]">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-bold text-[#081f2a]">
                <span className="text-slate-400">{i + 1}.</span> {title}
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-slate-500">{body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A phone shows half the similar products: twelve rows of two were enough before the footer. */
const SIMILAR_ON_A_PHONE = 12;

interface Props {
  product: PDPProduct;
  similar: ProductCardData[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ModalProduct = any;

export function ProductDetailView({ product, similar }: Props) {
  const gallery = product.images.length ? product.images : product.imageUrl ? [product.imageUrl] : [];
  // Supplier HTML, read rather than printed. See src/lib/productDescription.ts.
  const parsed = parseDescription(product.description);
  const [active, setActive] = useState(0);
  const [inquiry, setInquiry] = useState<ModalProduct | null>(null);

  const openMainInquiry = () =>
    setInquiry({
      id: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      images: gallery,
      categoryRef: { name: product.categoryName },
    });

  const mainSrc = gallery[active] ? (getCdnUrl(gallery[active], 1024) as string) : null;

  return (
    <main className="min-h-screen bg-slate-50 pt-24 pb-16">
      {/* The page's full width, as the homepage and the catalogue have it
          (1920px), laid out as Amazon lays out a product: the gallery, the
          product, and the quote box beside them. It was a centred 1400px of
          two halves, which left a wide screen's margins empty under a
          navigation bar that runs edge to edge (the owner, 2026-10-11).

          Three columns from 1280px, so the product's own words sit in a
          column of their own and stay a readable length (about 500px at a
          1600px screen) however wide the page; on a laptop the quote box goes
          under the product, beside the gallery; below 1024px it is one column,
          as before. */}
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

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-10 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)] xl:gap-8 2xl:gap-10">
          {/* Gallery: the pictures down the side from a laptop up, as Amazon has them, under the picture below that.
              Pointing at one shows it; a tap or a press chooses it. */}
          <div className="min-w-0 lg:row-span-2 xl:row-span-1">
            <div className="flex flex-col gap-3 lg:flex-row-reverse lg:items-start">
              <div className="relative aspect-square w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:flex-1">
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
                <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] lg:max-h-[600px] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-0 [&::-webkit-scrollbar]:hidden">
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

          {/* The product */}
          <div className="min-w-0">
            {product.categoryName && (
              <span className="mb-3 inline-flex w-fit items-center rounded-full bg-[#27a8c4]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#176579]">
                {product.categoryName}
              </span>
            )}
            <h1 className="text-2xl font-extrabold leading-snug tracking-tight text-[#081f2a] sm:text-3xl">{product.name}</h1>

            {/* Ours, not the supplier's — see the note on `reference` above. */}
            <p className="mt-2.5 text-xs text-slate-500">
              Quote reference <span className="font-semibold tracking-wide text-slate-700">{product.reference}</span>
            </p>

            {parsed && (parsed.specs.length > 0 || parsed.paragraphs.length > 0) ? (
              <>
                {parsed.paragraphs.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {parsed.paragraphs.slice(0, 4).map((text) => (
                      <p key={text} className="text-sm leading-relaxed text-slate-600 sm:text-base">
                        {text}
                      </p>
                    ))}
                  </div>
                )}
                {parsed.specs.length > 0 && (
                  <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    {parsed.specs.slice(0, 12).map((s) => (
                      <div key={s.label} className="flex gap-2 border-b border-slate-100 py-1.5 text-sm">
                        <dt className="min-w-0 shrink-0 basis-[42%] font-medium text-slate-500">{s.label}</dt>
                        <dd className="min-w-0 flex-1 text-slate-800">{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            ) : (
              /* No description exists for any product in the catalogue, so this
                 is the normal path rather than the exception. Saying plainly
                 what the listing is beats leaving the space blank — and it is
                 the honest framing: the catalogue demonstrates capability, it
                 is not stock we hold. */
              <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-[15px]">
                This is a reference product, not stock we hold. We source items like it to your specification — your own material,
                size, finish, packaging or branding.
                {product.categoryName && product.categoryCount > 1 && product.categoryId ? (
                  <>
                    {" "}
                    It is one of{" "}
                    <Link href={`/products/?categoryId=${encodeURIComponent(product.categoryId)}`} className="font-semibold text-[#176579] hover:underline">
                      {product.categoryCount.toLocaleString("en-US")} products we can source in {product.categoryName}
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            )}

            {/* The supplier's size chart, when the description carried one.
                Scrolls inside its own box: these tables run to a dozen columns
                and must never widen the page. */}
            {parsed?.sizeChart && parsed.sizeChart.rows.length > 0 && (
              <div className="mt-6 border-t border-slate-200 pt-5">
                <h2 className="mb-3 text-[13px] font-bold text-[#081f2a]">Size chart</h2>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
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

            {/* What happens next, under the product from 1280px, where a CJ listing (no description) would
                otherwise end two lines in beside a gallery four times its height. Below that it follows the quote
                box (the copy in the aside), so the way to a quote comes first. */}
            <Steps className="mt-6 hidden border-t border-slate-200 pt-5 xl:block" />
          </div>

          {/* The quote box, where Amazon puts its buy box: beside the product from 1280px, held in view as the page
              scrolls; under its words on a laptop, beside the gallery, and after them below that, the steps
              following it. The three badges that closed the page here
              ("Factory-checked sourcing since 2000", "Inspected before shipment", "7 offices worldwide") read to the
              owner as made by a machine (2026-10-11); the steps above already say the goods are inspected. */}
          <aside aria-label="Request a quote" className="min-w-0 lg:col-start-2 xl:col-start-3 xl:row-start-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-28">
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
              {/* MOQ, stated the honest way. The quote form's lowest tier is 20
                  pieces, but the real minimum is the factory's, so promising a
                  number here would be a claim we cannot keep. */}
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                Minimum order quantity is set by the factory and confirmed with your quote. Tell us your target quantity and we will
                come back with options.
              </p>
            </div>
            <Steps className="mt-6 xl:hidden" />
          </aside>
        </div>

        {/* Similar products: twenty-four, which fills whole rows at two, three, four and six across (twelve on a
            phone). */}
        {similar.length > 0 && (
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
              {similar.map((p, i) => (
                <div key={p.id} className={`min-w-0 ${i >= SIMILAR_ON_A_PHONE ? "max-sm:hidden" : ""}`}>
                  <ProductCard product={p} onClick={() => setInquiry({ ...p, images: p.imageUrl ? [p.imageUrl] : [] })} />
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
