"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ChevronRight, Flame } from "lucide-react";
import { InquiryModal } from "@/components/ui/InquiryModal";
import { TextMorph } from "@/components/ui/text-morph";
import SocialCards, { type CardItem } from "@/components/ui/card-fan-carousel";
import { getCdnUrl } from "@/lib/cdn";

export function PopularProductsSection() {
  const [products, setProducts] = useState<any[]>([]);
  const [inquiryProduct, setInquiryProduct] = useState<any | null>(null);

  useEffect(() => {
    fetch("/api/products?limit=140")
      .then((res) => res.json())
      .then((data) => {
        if (data?.data) setProducts(data.data);
      })
      .catch((err) => console.error(err));
  }, []);

  // Build fan cards from real catalog products. The homepage hero grid renders
  // the FIRST slice of this same feed, so Trending deliberately takes a LATER
  // window (skipping what the hero already shows) — each product on the page is
  // unique, no repeats between the grid and this carousel.
  const HERO_COUNT = 61; // must match MarketplaceHeroSection's initial fetch
  const cards = useMemo<CardItem[]>(() => {
    const withImg = products.filter((p) => p.imageUrl);
    // Prefer the window right after the hero's set; fall back to the tail if the
    // feed is short so the carousel is never empty.
    const slice = withImg.length > HERO_COUNT + 4 ? withImg.slice(HERO_COUNT, HERO_COUNT + 20) : withImg.slice(-20);
    return slice
      .map((p) => ({
        imgUrl: getCdnUrl(p.imageUrl) as string,
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
            <TextMorph
              words={["sourcing", "importing", "wholesale", "OEM supply"]}
              interval={2600}
              className="text-brand"
            />
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
            href="/products"
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
