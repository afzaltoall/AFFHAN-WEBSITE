"use client";

import type { CategoryRecord } from "@/lib/categoryTree";

/**
 * One shared fetch of the full category list, for every client that wants it.
 *
 * The list is ~252KB of JSON — the whole taxonomy, 668 rows. Two components
 * need it and both idle-prefetch it independently: the navbar's category menu
 * and the hero's mega-panel. Before this they each called `fetch` themselves
 * and each memoised the result in their own ref, so a single homepage visit
 * downloaded and JSON-parsed a quarter of a megabyte twice.
 *
 * It was actually four requests, not two. `next.config` sets
 * `trailingSlash: true`, so `/api/categories` answers 308 to
 * `/api/categories/` and every caller paid two round trips for one response.
 * The path here keeps the slash.
 *
 * Module scope is the right place for this precisely because it outlives the
 * components: whichever of them asks first starts the request, the other
 * awaits the same promise, and a later panel open is free.
 */
let inFlight: Promise<CategoryRecord[]> | null = null;

/**
 * A failed load must not be remembered as an empty catalogue.
 *
 * The previous version cleared the memo in `.catch`, which only runs when the
 * promise REJECTS — a network failure. A non-ok HTTP response does not reject:
 * `fetch` resolves normally with `ok: false`, took the `{ data: [] }` branch,
 * and the memo kept that successful-looking empty result for the life of the
 * page. Every later caller, including the navbar's deliberate retry, got []
 * back instantly, so the retry path was dead code in precisely the case it
 * was written for.
 *
 * That is not hypothetical here: /api/categories/ answers 403 whenever
 * Vercel's automatic mitigation challenges the visitor, which is exactly the
 * intermittency behind the stuck menu.
 *
 * So both failure modes now go through one path — throw, clear the memo, hand
 * the caller an empty list — and the next call starts a fresh request.
 */
export function loadAllCategories(): Promise<CategoryRecord[]> {
  if (!inFlight) {
    const attempt = fetch("/api/categories/")
      .then((r) => {
        if (!r.ok) throw new Error(`categories ${r.status}`);
        return r.json();
      })
      .then((j) => {
        const data = (j?.data as CategoryRecord[]) || [];
        // An empty list is also a failure. The catalogue is never empty, so
        // [] means something went wrong upstream, and caching it would blank
        // the menu until a full page load.
        if (!data.length) throw new Error("categories empty");
        return data;
      })
      .catch((err) => {
        if (inFlight === attempt) inFlight = null;
        console.error("[categories] load failed:", err);
        return [] as CategoryRecord[];
      });
    inFlight = attempt;
  }
  return inFlight;
}
