"use client";

import { useState, useEffect, useMemo } from "react";
import { shuffleArray, POPULAR_COUNT } from "@/lib/heroPool";
import Link from "next/link";
import { ChevronRight, Flame } from "lucide-react";
import dynamic from 'next/dynamic';
const InquiryModal = dynamic(() => import("@/components/ui/InquiryModal").then(mod => mod.InquiryModal), { ssr: false });
import { TextMorph } from "@/components/ui/text-morph-wrapper";
const SocialCards = dynamic(() => import("@/components/ui/card-fan-carousel"), { ssr: true });
import type { CardItem } from "@/components/ui/card-fan-carousel";
import type { ProductCardData } from "@/components/ui/ProductCard";

export function PopularProductsSection({ initialProducts = [] }: { initialProducts?: ProductCardData[] }) {
  const [products, setProducts] = useState<ProductCardData[]>(initialProducts);
  const [inquiryProduct, setInquiryProduct] = useState<ProductCardData | null>(null);

  // Re-pick after hydration so the carousel varies between visits. Must be an
  // effect, not useState or render: the first client pass has to match the
  // server HTML exactly or React reports a hydration mismatch.
  useEffect(() => {
    if (!initialProducts.length) return;
    setProducts(shuffleArray(initialProducts));
  }, [initialProducts]);

  // This section now receives its OWN slice of the pool from src/app/page.tsx,
  // already disjoint from the hero grid's and the spotlight's. The old approach
  // — take the same array and skip the first 61, "must match
  // MarketplaceHeroSection's initial fetch" — was a coupling that broke the
  // moment either count changed, and the spotlight's slice(60, 65) overlapped
  // it regardless.
  const cards = useMemo<CardItem[]>(() => {
    const withImg = products.filter((p) => p.imageUrl);
    return withImg
      .slice(0, POPULAR_COUNT)
      .map((p) => ({
        imgUrl: p.imageUrl as string,
        alt: p.name,
        tag: p.categoryRef?.name || p.category || "Product",
        title: p.name,
        onSelect: () => setInquiryProduct(p),
      }));
  }, [products]);

  return (
    <section id="popular-products" className="w-full bg-slate-50 py-10 sm:py-14 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col items-center text-center gap-2 sm:gap-3 mb-2 sm:mb-4">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-brand">
            <Flame size={14} /> Popular Products
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-slate-900 flex flex-wrap items-center justify-center gap-x-2.5">
            <span>Trending products ready for</span>
            <div className="flex justify-start min-w-[110px] sm:min-w-[140px] lg:min-w-[180px]">
              <TextMorph
                words={["sourcing", "importing", "wholesale", "OEM supply"]}
                interval={2600}
                className="text-brand"
              />
            </div>
          </h2>
          <p className="text-slate-500 max-w-xl">
            High-demand listings across our top sourcing categories. Tap any product to request a quote.
          </p>
        </div>

        {cards.length === 0 ? (
          <div className="flex items-center justify-center h-[22rem] sm:h-[34rem]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
          </div>
        ) : (
          <SocialCards cards={cards} />
        )}

        <div className="flex justify-center mt-2">
          <Link
            href="/products/"
            className="inline-flex items-center gap-2 text-sm font-bold text-brand-dark hover:gap-3 transition-all"
          >
            View full catalog <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      {inquiryProduct && (
        <InquiryModal product={inquiryProduct} onClose={() => setInquiryProduct(null)} />
      )}
    </section>
  );
}
