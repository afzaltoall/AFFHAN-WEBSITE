"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, BadgeCheck, Globe, ChevronRight, Info } from "lucide-react";
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
}

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

            {product.description && (
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-600 sm:text-base">
                {product.description}
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

            {/* Trust badges */}
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-t border-slate-200 pt-5">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                <ShieldCheck className="h-4.5 w-4.5 text-emerald-500" /> Verified sourcing
              </span>
              <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                <BadgeCheck className="h-4.5 w-4.5 text-emerald-500" /> Quality inspection
              </span>
              <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                <Globe className="h-4.5 w-4.5 text-emerald-500" /> Global shipping
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
