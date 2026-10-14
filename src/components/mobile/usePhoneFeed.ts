import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductCardData } from "@/components/ui/ProductCard";

const PAGE = 40;
const MAX_PAGES = 10;

/** usePhoneFeed's key for the homepage's own curated draw (the categories screen's Popular). */
export const POPULAR_FEED = "popular";

/**
 * Products for a phone's grid, a page at a time from the catalogue's own API (moderation applied there), the
 * next page asked for as the sentinel nears the screen: no button (the owner: the grid loads by itself), up
 * to 400.
 *   - A family's id: its products and its descendants', in the catalogue's order (the homepage's families
 *     row, the categories screen's rail).
 *   - POPULAR_FEED: the homepage's own curated draw, a fresh one each page and none twice (excludeIds), after
 *     `seed`, the ones the server sent. `seed` is read when the key changes, so pass the same array.
 *   - null: nothing.
 * `maxPages`: how far it goes, 40 a page; a category's own page (PhoneCategoryPage) goes further than a grid
 * beside something else.
 */
export function usePhoneFeed(key: string | null, seed?: ProductCardData[], maxPages = MAX_PAGES) {
  const [products, setProducts] = useState<ProductCardData[]>(() => (key === POPULAR_FEED ? (seed ?? []) : []));
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const listRef = useRef<ProductCardData[]>(products);
  const pageRef = useRef(0);
  const seq = useRef(0);
  const busy = useRef(false);

  const loadNext = useCallback(async () => {
    if (!key || busy.current || done) return;
    busy.current = true;
    const mine = seq.current;
    const page = pageRef.current + 1;
    const popular = key === POPULAR_FEED;
    setLoading(true);
    try {
      const res = await fetch(
        popular
          ? `/api/products/?limit=${PAGE}&page=1&excludeIds=${listRef.current.map((p) => p.id).join(",")}`
          : `/api/products/?categoryId=${encodeURIComponent(key)}&limit=${PAGE}&page=${page}`,
      );
      const json = (await res.json()) as { data?: ProductCardData[]; pagination?: { totalPages?: number } };
      if (mine !== seq.current) return;
      const got = (json.data ?? []).filter((p) => p.imageUrl);
      pageRef.current = page;
      const seen = new Set(listRef.current.map((p) => String(p.id)));
      listRef.current = [...listRef.current, ...got.filter((p) => !seen.has(String(p.id)))];
      setProducts(listRef.current);
      const last = popular ? !got.length || page >= maxPages : !json.data?.length || page >= Math.min(maxPages, json.pagination?.totalPages ?? maxPages);
      if (last) setDone(true);
    } catch {
      if (mine === seq.current) setDone(true);
    } finally {
      if (mine === seq.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [key, done, maxPages]);

  // A new key starts over.
  useEffect(() => {
    seq.current++;
    busy.current = false;
    pageRef.current = 0;
    listRef.current = key === POPULAR_FEED ? (seed ?? []) : [];
    setProducts(listRef.current);
    setDone(false);
    setLoading(false);
  }, [key, seed]);
  useEffect(() => {
    if (key && pageRef.current === 0 && !busy.current) void loadNext();
  }, [key, loadNext]);

  const observer = useRef<IntersectionObserver | null>(null);
  const sentinel = useCallback(
    (el: HTMLElement | null) => {
      observer.current?.disconnect();
      if (!el || !key) return;
      observer.current = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void loadNext(), { rootMargin: "900px 0px" });
      observer.current.observe(el);
    },
    [key, loadNext],
  );

  return { products, loading, done, sentinel };
}
