"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { CircularTestimonials } from "@/components/ui/circular-testimonials";
import { InquiryModal } from "@/components/ui/InquiryModal";
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
export function ProductSpotlightSection() {
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [inquiryProduct, setInquiryProduct] = useState<ProductCardData | null>(null);

  useEffect(() => {
    fetch("/api/products?limit=140")
      .then((r) => r.json())
      .then((d) => setProducts((d?.data || []).filter((p: ProductCardData) => p.imageUrl)))
      .catch(() => {});
  }, []);

  // Take a LATER slice than the trending fan / orbit so the spotlight shows a
  // different set of products.
  const spotlight = useMemo(
    () =>
      products.slice(60, 65).map((p) => ({
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
