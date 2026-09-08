"use client";

import { useEffect, useMemo, useState } from "react";
import { useIsomorphicLayoutEffect } from "@/lib/useIsomorphicLayoutEffect";
import { shuffleArray, SPOTLIGHT_COUNT } from "@/lib/heroPool";
import { Sparkles } from "lucide-react";
import dynamic from 'next/dynamic';
const CircularTestimonials = dynamic(() => import("@/components/ui/circular-testimonials").then(mod => mod.CircularTestimonials), { ssr: true });
const InquiryModal = dynamic(() => import("@/components/ui/InquiryModal").then(mod => mod.InquiryModal), { ssr: false });
import type { ProductCardData } from "@/components/ui/ProductCard";

function sourcingBlurb(categoryName: string) {
  return `Sourced from vetted ${categoryName.toLowerCase()} suppliers across China — quality-checked, freighted, and delivered to your door. Share your target quantity and we’ll come back with a quote.`;
}

/**
 * Product spotlight band — a circular-testimonials carousel repurposed to
 * describe our sourcing for a handful of real catalog products. Lives at the
 * bottom of the home page, right before the footer. Clicking opens the quote
 * modal.
 */
export function ProductSpotlightSection({ initialProducts = [] }: { initialProducts?: ProductCardData[] }) {
  const [products, setProducts] = useState<ProductCardData[]>(() => 
    initialProducts.filter((p: ProductCardData) => p.imageUrl)
  );
  const [inquiryProduct, setInquiryProduct] = useState<ProductCardData | null>(null);

  // Re-pick after hydration so the spotlight varies between visits. Effect, not
  // render, or the first client pass would not match the server HTML.
  useIsomorphicLayoutEffect(() => {
    const withImage = initialProducts.filter((p: ProductCardData) => p.imageUrl);
    if (!withImage.length) return;
    setProducts(shuffleArray(withImage));
  }, [initialProducts]);

  // This section receives its own slice from src/app/page.tsx, disjoint from
  // the hero grid's and the carousel's. It used to take slice(60, 65) of the
  // shared feed, which sat inside the hero's first 61 and the carousel's
  // 61..81 — the same product could appear twice on one screen.
  const spotlight = useMemo(
    () =>
      products.slice(0, SPOTLIGHT_COUNT).map((p) => ({
        quote: sourcingBlurb(p.categoryRef?.name || p.category || "product"),
        name: p.name,
        designation: p.categoryRef?.name || p.category || "Global Sourcing",
        src: p.imageUrl as string,
        _product: p,
      })),
    [products]
  );

  if (spotlight.length < 5) return null;

  return (
    <section className="bg-slate-50 px-4 sm:px-6 lg:px-8 py-10 sm:py-12 border-t border-slate-200">
      <div className="mx-auto max-w-[1200px]">
        <div className="text-center mb-6 sm:mb-8">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-brand">
            <Sparkles size={14} /> Product Spotlight
          </span>
          <h2 className="mt-2 text-2xl sm:text-4xl font-black tracking-tight text-slate-900">
            A closer look at what we source
          </h2>
        </div>
        <div className="flex justify-center">
          <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-4 sm:p-6 w-full max-w-4xl">
            <CircularTestimonials
              key={spotlight.length}
              testimonials={spotlight}
              autoplay
              colors={{
                name: "#0f172a",
                designation: "#64748b",
                testimony: "#334155",
                arrowBackground: "#176579",
                arrowForeground: "#f1f5f9",
                arrowHoverBackground: "#27a8c4",
              }}
              fontSizes={{ name: "24px", designation: "15px", quote: "17px" }}
            />
            <div className="text-center mt-6">
              <button
                onClick={() => spotlight[0] && setInquiryProduct(spotlight[0]._product)}
                className="inline-flex items-center gap-2 rounded-full bg-brand hover:bg-brand-dark text-white font-bold text-sm px-6 py-3 transition-colors"
              >
                Request a quote
              </button>
            </div>
          </div>
        </div>
      </div>

      {inquiryProduct && <InquiryModal product={inquiryProduct} onClose={() => setInquiryProduct(null)} />}
    </section>
  );
}

export default ProductSpotlightSection;
