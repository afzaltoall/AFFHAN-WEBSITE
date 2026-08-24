"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ShieldCheck,
  BadgeCheck,
  Globe,
  ChevronRight,
  Info,
  FileText,
  Factory,
  ClipboardCheck,
  Ship,
} from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { ProductCard, type ProductCardData } from "@/components/ui/ProductCard";
import { InquiryModal } from "@/components/ui/InquiryModal";

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
}

/**
 * What actually happens after the button is pressed.
 *
 * This exists because the description field is empty for all 1,068,225 rows —
 * CJ's list endpoint does not return one — so the column had a title, a notice
 * and a button and nothing else. These four steps are the real process rather
 * than filler, and being static they are true of every product, which no
 * scraped copy would be.
 */
const STEPS = [
  { Icon: FileText, title: "You send the request", body: "Quantity, the spec you need, and where it ships to." },
  { Icon: Factory, title: "We match a factory", body: "Our Guangzhou team sources it and checks the plant." },
  { Icon: ClipboardCheck, title: "Quality inspection", body: "Goods are inspected before they leave China." },
  { Icon: Ship, title: "Freight and customs", body: "Sea or air, cleared and delivered to your door." },
];

interface Props {
  product: PDPProduct;
  similar: ProductCardData[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ModalProduct = any;

export function ProductDetailView({ product, similar }: Props) {
  const gallery = product.images.length ? product.images : product.imageUrl ? [product.imageUrl] : [];
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

  const mainSrc = gallery[active] ? (getCdnUrl(gallery[active]) as string) : null;

  return (
    <main className="min-h-screen bg-slate-50 pt-24 pb-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <Link href="/" className="hover:text-[#176579]">Home</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link
            href={product.categoryId ? `/products/?categoryId=${encodeURIComponent(product.categoryId)}` : "/products"}
            className="hover:text-[#176579]"
          >
            {product.categoryName || "Catalog"}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="max-w-[60vw] truncate font-medium text-slate-700 sm:max-w-none">{product.name}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Gallery */}
          <div>
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {mainSrc ? (
                <Image
                  src={mainSrc}
                  alt={product.name}
                  fill
                  sizes="(max-width: 1024px) 100vw, 520px"
                  className="object-contain p-4"
                  priority
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-slate-300">No image available</div>
              )}
            </div>

            {gallery.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2.5">
                {gallery.slice(0, 8).map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    aria-label={`View image ${i + 1}`}
                    className={`relative h-16 w-16 overflow-hidden rounded-xl border bg-white transition-all ${
                      i === active ? "border-[#27a8c4] ring-2 ring-[#27a8c4]/25" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <Image src={getCdnUrl(img) as string} alt="" fill sizes="64px" className="object-contain p-1" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col">
            {product.categoryName && (
              <span className="mb-3 inline-flex w-fit items-center rounded-full bg-[#27a8c4]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#176579]">
                {product.categoryName}
              </span>
            )}
            <h1 className="text-2xl font-extrabold leading-snug tracking-tight text-[#081f2a] sm:text-3xl">
              {product.name}
            </h1>

            {/* Ours, not the supplier's — see the note on `reference` above. */}
            <p className="mt-2.5 text-xs text-slate-500">
              Quote reference{" "}
              <span className="font-semibold tracking-wide text-slate-700">{product.reference}</span>
            </p>

            {product.description ? (
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-600 sm:text-base">
                {product.description}
              </p>
            ) : (
              /* No description exists for any product in the catalogue, so this
                 is the normal path rather than the exception. Saying plainly
                 what the listing is beats leaving the space blank — and it is
                 the honest framing: the catalogue demonstrates capability, it
                 is not stock we hold. */
              <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-[15px]">
                This is a reference product, not stock we hold. We source items like it to your
                specification — your own material, size, finish, packaging or branding.
                {product.categoryName && product.categoryCount > 1 && product.categoryId ? (
                  <>
                    {" "}
                    It is one of{" "}
                    <Link
                      href={`/products/?categoryId=${encodeURIComponent(product.categoryId)}`}
                      className="font-semibold text-[#176579] hover:underline"
                    >
                      {product.categoryCount.toLocaleString("en-US")} products we can source in{" "}
                      {product.categoryName}
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            )}

            {/* Inquiry-only: no price, sourced to order. */}
            <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-[#27a8c4]/20 bg-[#27a8c4]/[0.06] px-4 py-3">
              <Info className="h-5 w-5 shrink-0 text-[#176579]" />
              <p className="text-sm text-slate-600">
                No public price — this item is <span className="font-semibold text-[#176579]">sourced to order</span>. Request a quote and our team will get it for you.
              </p>
            </div>

            <button
              onClick={openMainInquiry}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#27a8c4] to-[#176579] text-sm font-bold text-white shadow-[0_8px_24px_rgba(39,168,196,0.25)] transition-all duration-300 hover:from-[#176579] hover:to-[#081f2a] hover:shadow-[0_12px_32px_rgba(23,85,101,0.35)] hover:scale-[1.01] active:scale-[0.99] sm:w-auto sm:px-10"
            >
              Request a Quote
              <ChevronRight className="h-4 w-4" />
            </button>

            {/* MOQ, stated the honest way. The quote form's lowest tier is 20
                pieces, but the real minimum is the factory's, so promising a
                number here would be a claim we cannot keep. */}
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Minimum order quantity is set by the factory and confirmed with your quote. Tell us
              your target quantity and we will come back with options.
            </p>

            {/* What happens next */}
            <div className="mt-6 border-t border-slate-200 pt-5">
              <h2 className="mb-3.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                What happens after you ask
              </h2>
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
                      <span className="mt-0.5 block text-[11.5px] leading-relaxed text-slate-500">
                        {body}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Trust row. Each item now carries a fact that is checkable against
                our own records — seven office entries, trading since 2000, 509
                product-bearing categories — rather than three bare labels. */}
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-t border-slate-200 pt-5">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                <ShieldCheck className="h-4.5 w-4.5 shrink-0 text-emerald-500" /> Factory-checked
                sourcing since 2000
              </span>
              <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                <BadgeCheck className="h-4.5 w-4.5 shrink-0 text-emerald-500" /> Inspected before
                shipment
              </span>
              <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                <Globe className="h-4.5 w-4.5 shrink-0 text-emerald-500" /> 7 offices worldwide
              </span>
            </div>
          </div>
        </div>

        {/* Similar products */}
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
              {similar.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onClick={() => setInquiry({ ...p, images: p.imageUrl ? [p.imageUrl] : [] })}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <InquiryModal product={inquiry} onClose={() => setInquiry(null)} />
    </main>
  );
}
