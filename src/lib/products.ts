import { Prisma } from ".prisma/client";
import { prisma } from "./prisma";
import { blockedCategoryIdSet, isCategoryBlocked } from "@/lib/moderation";
import { TAG_CATEGORIES, TAG_PRODUCTS } from "@/lib/cacheTags";
import { cachedOnce } from "@/lib/cachedOnce";
import { sumProductCounts } from "@/lib/categoryCounts";
import { readSnapshot } from "@/lib/snapshotStore";

export type HeroProduct = {
  id: number;
  name: string;
  imageUrl: string | null;
  category: string | null;
  categoryId: string | null;
};

export type MappedProduct = {
  id: number;
  name: string;
  imageUrl: string | null;
  category: string | null;
  categoryRef: { name: string | null } | null;
};

/**
 * The products the site shows, in every category it shows plus those with
 * none: the daily refresh's figure (lib/snapshots.ts), never a COUNT on a
 * request. Before the refresh has stored one, the categories' stored counts
 * added up, which leaves out only the uncategorised few.
 */
export async function getCachedProductCount(): Promise<number> {
  const stored = await readSnapshot<number>("catalogue-total", "current");
  if (typeof stored === "number") return stored;
  const all = await getCachedAllCategories();
  const blocked = blockedCategoryIdSet(all);
  return sumProductCounts(all, all.filter((c) => !blocked.has(c.id)).map((c) => c.id));
}

/**
 * How many products the site shows across these categories (expanded and
 * moderated by the caller): their stored counts added up, no query at all.
 * It used to COUNT(*) them with the name regex, about a second for a large
 * subtree, on every category page whose count had dropped out of the cache.
 */
export async function getCachedCategoryProductCount(categoryIds: string[]): Promise<number> {
  return sumProductCounts(await getCachedAllCategories(), categoryIds);
}

export type CategoryLite = { id: string; name: string; parentId: string | null; parentName: string | null; thumbnailUrl: string | null; productCount: number };

export const getCachedAllCategories = cachedOnce(
  async (): Promise<CategoryLite[]> => {
    const cats = await prisma.category.findMany({
      select: { id: true, name: true, parentId: true, parentName: true, thumbnailUrl: true, productCount: true },
    });
    return cats;
  },
  ["all-categories-lite"],
  { revalidate: 3600, tags: [TAG_CATEGORIES] }
);

const PREFERRED_TOP_NAMES = [
  "Computer & Office",
  "Consumer Electronics",
  "Home Improvement",
  "Automobiles & Motorcycles", // cars, bikes
  "Pet Supplies",
  "Home, Garden & Furniture", // home items, kitchens, lights
  "Sports & Outdoors", // gym, bicycle
  "Toys, Kids & Babies", // costumes, novelty
  "Men's Clothing",
];

/** The clean families' categories, every one under them that is not moderated: from a list of categories, no query. */
export function preferredCategoryIds(allCategories: ReadonlyArray<{ id: string; name: string; parentId: string | null }>): string[] {
  const nameById = new Map(allCategories.map(c => [c.id, c.name]));
  const childrenMap = new Map<string, string[]>();
  for (const c of allCategories) {
    if (c.parentId) {
      if (!childrenMap.has(c.parentId)) childrenMap.set(c.parentId, []);
      childrenMap.get(c.parentId)!.push(c.id);
    }
  }
  const preferredTopIds = allCategories
    .filter(c => !c.parentId && PREFERRED_TOP_NAMES.includes(c.name))
    .map(c => c.id);
  const sourceCatSet = new Set<string>();
  const queue = [...preferredTopIds];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (isCategoryBlocked(nameById.get(curr))) continue;
    sourceCatSet.add(curr);
    for (const child of childrenMap.get(curr) ?? []) queue.push(child);
  }
  return Array.from(sourceCatSet);
}

/**
 * The pool the homepage hero and the app's home feed are shuffled from, for
 * the daily refresh (lib/snapshots.ts), which stores it: never on a request.
 *
 * Each category's six newest products with a picture, read straight off the
 * (categoryId, isBlockedName, id DESC) index: a handful of rows per category.
 * It used to rank every product in these categories first (ROW_NUMBER over all
 * of them, then rn <= 6), which read 586,586 rows across 440 categories, ran
 * the name filter on each, and took 10 to 27 seconds on the live database
 * (5 Oct 2026), 0.3s this way, and less with the flag in place of the regex.
 * Same rows in the same order as the old query.
 */
export async function computeHeroPool(sourceCatIds: string[]): Promise<HeroProduct[]> {
  if (!sourceCatIds.length) return [];
  return await prisma.$queryRaw<Array<{ id: number; name: string; imageUrl: string | null; category: string | null; categoryId: string | null }>>(
    Prisma.sql`
      SELECT "id", "name", "imageUrl", "category", "categoryId" FROM (
        SELECT p.*, ROW_NUMBER() OVER (PARTITION BY p."categoryId" ORDER BY p."id" DESC) AS rn
        FROM unnest(ARRAY[${Prisma.join(sourceCatIds)}]::text[]) AS c(id)
        CROSS JOIN LATERAL (
          SELECT "id", "name", "imageUrl", "category", "categoryId"
          FROM "Product"
          WHERE "categoryId" = c.id
            AND "isBlockedName" = false
            AND "imageUrl" IS NOT NULL
          ORDER BY "id" DESC
          LIMIT 6
        ) p
      ) ranked
      ORDER BY rn ASC, "categoryId" ASC
      LIMIT 600
    `
  );
}

/** The stored pool; empty until the refresh has stored one. */
export async function getHeroPool(): Promise<HeroProduct[]> {
  return (await readSnapshot<HeroProduct[]>("hero-pool", "current")) ?? [];
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function getHeroFeed(limit: number, excludeIds: number[] = []) {
  let products: MappedProduct[] = [];
  
  const allCats = await getCachedAllCategories();
  const catById = new Map(allCats.map((c) => [c.id, c]));

  // Precomputed by the daily refresh; the shuffle is the only work done here.
  const pool = await getHeroPool();
  if (pool.length > 0) {
    const exclude = new Set(excludeIds);
    const available = exclude.size ? pool.filter((r) => !exclude.has(r.id)) : pool;
    const rows: HeroProduct[] = shuffle(available).slice(0, limit);

    products = rows.map((r: HeroProduct) => ({
      id: r.id,
      name: r.name,
      imageUrl: r.imageUrl,
      category: r.category,
      categoryRef: r.categoryId ? { name: catById.get(r.categoryId as string)?.name || null } : null
    }));
  }

  const total = await getCachedProductCount();

  return {
    products,
    total
  };
}

/** One card in the "Similar products" rail: the same shape the grid needs. */
export type SimilarProduct = {
  id: number;
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
};

/**
 * How many rows to ask the database for, against how many the rail shows.
 *
 * The gap is the moderation filter: filterHidden() drops rows after the query,
 * so asking for exactly SIMILAR_SHOWN would leave the rail short on any
 * category holding blocked items. Three times over is generous, and costs
 * nothing worth measuring — the query is served straight off the categoryId
 * index and selects four columns.
 */
/** Forty: twenty-four under the product (whole rows at two, three, four and six across) and up to sixteen beside the quote box (ProductDetailView). */
export const SIMILAR_SHOWN = 40;
const SIMILAR_FETCH = SIMILAR_SHOWN * 3;

/**
 * Products from the same category, for the rail at the bottom of a PDP.
 *
 * Cached like every other catalogue read here — same hour, same tags — so the
 * larger take does not turn into a larger per-request cost. The catalogue is
 * synced once a day, so an hour-old "similar" list is never meaningfully
 * stale, and a sync revalidates TAG_PRODUCTS anyway.
 *
 * Deliberately no orderBy: sorting a large category by lastSynced forced a full
 * scan of the category and was the main source of PDP latency. An arbitrary
 * handful off the index is plenty for "similar".
 *
 * Returns rows the caller still moderates, on purpose: only the stored name
 * flag is applied here, and the caller's filter runs on every request, so a
 * product blocked after this entry was cached still disappears immediately
 * rather than lingering for the rest of the hour.
 */
export const getCachedSimilarProducts = cachedOnce(
  async (categoryId: string, excludeId: number): Promise<SimilarProduct[]> =>
    prisma.product.findMany({
      // isBlockedName here as well, so fewer of the rows fetched are dropped
      // by the filter below; the filter stays, for a name blocked since.
      where: { categoryId, isBlockedName: false, id: { not: excludeId }, imageUrl: { not: null } },
      take: SIMILAR_FETCH,
      select: { id: true, name: true, imageUrl: true, categoryId: true },
    }),
  ["pdp-similar-products"],
  { revalidate: 3600, tags: [TAG_CATEGORIES, TAG_PRODUCTS] }
);
