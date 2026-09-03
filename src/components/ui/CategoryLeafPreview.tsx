"use client";

import { useEffect, useRef, useState } from "react";
import { CategoryTile } from "@/components/ui/CategoryTile";

/**
 * Product thumbnails standing in for sub-categories, in the mega-menu.
 *
 * Every other section of that menu fills its row with the category's
 * sub-categories. A promoted leaf has none — it is the bottom of CJ's tree —
 * so it rendered as one lonely tile beside "View All", which read as a broken
 * section rather than a small one. Its products are the only thing it has to
 * show, so it shows those.
 *
 * Fetched when the section scrolls into view, not when the menu opens. The
 * panel stacks fifty sections in one scroller and only the first is visible;
 * loading every leaf's products up front would fire a request per promoted
 * leaf for rows nobody has looked at. That matters more the more leaves get
 * promoted, which is the point of keeping this general.
 *
 * The request is the same one the rest of the site makes —
 * /api/products?categoryId=…&limit=… , default order — rather than a new idea
 * about what "top products" means.
 */

interface PreviewProduct {
  id: number;
  name: string;
  imageUrl: string | null;
}

export function CategoryLeafPreview({
  categoryId,
  count = 7,
  onOpenProduct,
}: {
  categoryId: string;
  /** How many tiles to draw, matching the width of a sub-category row. */
  count?: number;
  onOpenProduct: (productId: number) => void;
}) {
  const [products, setProducts] = useState<PreviewProduct[] | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/products?categoryId=${encodeURIComponent(categoryId)}&limit=${count}`);
        const json = await res.json();
        if (!cancelled) setProducts(Array.isArray(json?.data) ? json.data : []);
      } catch {
        // A menu preview is not worth an error state; the "View All" tile
        // beside it still works.
        if (!cancelled) setProducts([]);
      }
    };

    // No IntersectionObserver (old Safari, and jsdom in tests): fetch straight
    // away rather than never.
    if (typeof IntersectionObserver === "undefined") {
      void load();
      return () => {
        cancelled = true;
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void load();
        }
      },
      // A screen of lead time, so the tiles are there by the time the section
      // is actually read.
      { root: el.closest("[data-mega-scroll]"), rootMargin: "300px" }
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [categoryId, count]);

  return (
    <>
      {products === null
        ? Array.from({ length: count }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              // The first placeholder is what the observer watches. It has to
              // be a real box: an earlier version used a wrapper with
              // `display: contents`, which has no layout box at all, so the
              // observer never reported it and the products never loaded.
              ref={i === 0 ? ref : undefined}
              className="flex flex-col items-center gap-2"
            >
              <div className="h-14 w-14 animate-pulse rounded-full bg-slate-100 sm:h-[68px] sm:w-[68px]" />
              <div className="h-3 w-12 animate-pulse rounded bg-slate-100" />
            </div>
          ))
        : products.map((p) => (
            // The same tile the sub-category rows use, so a leaf section and a
            // parent section look like the same menu.
            <CategoryTile
              key={p.id}
              name={p.name}
              thumbnailUrl={p.imageUrl}
              hideOnError
              onClick={() => onOpenProduct(p.id)}
            />
          ))}
    </>
  );
}
