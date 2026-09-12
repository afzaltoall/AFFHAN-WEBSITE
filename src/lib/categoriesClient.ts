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

export function loadAllCategories(): Promise<CategoryRecord[]> {
  if (!inFlight) {
    inFlight = fetch("/api/categories/")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => (j.data as CategoryRecord[]) || [])
      .catch(() => {
        // Clear the memo so a retry is possible. Leaving a rejected promise
        // cached would make one failed prefetch permanently empty the menu.
        inFlight = null;
        return [];
      });
  }
  return inFlight;
}
