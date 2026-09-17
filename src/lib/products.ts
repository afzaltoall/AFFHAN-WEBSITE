import { Prisma } from ".prisma/client";
import { prisma } from "./prisma";
import { unstable_cache } from "next/cache";
import { blockedNameRegex, isCategoryBlocked } from "@/lib/moderation";
import { TAG_CATEGORIES, TAG_PRODUCTS } from "@/lib/cacheTags";

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

export const getCachedProductCount = unstable_cache(
  async (): Promise<number> => await prisma.product.count(),
  ["total-product-count"],
  { revalidate: 3600, tags: [TAG_PRODUCTS] }
);

export const getCachedCategoryProductCount = unstable_cache(
  async (categoryIds: string[]): Promise<number> => {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "Product" p
        WHERE p."categoryId" IN (${Prisma.join(categoryIds)})
          AND p."name" !~* ${blockedNameRegex()}
      `
    );
    return Number(rows[0]?.count ?? 0);
  },
  ["category-product-count"],
  { revalidate: 3600, tags: [TAG_CATEGORIES, TAG_PRODUCTS] }
);

export type CategoryLite = { id: string; name: string; parentId: string | null; parentName: string | null; thumbnailUrl: string | null };

export const getCachedAllCategories = unstable_cache(
  async (): Promise<CategoryLite[]> => {
    const cats = await prisma.category.findMany({
      select: { id: true, name: true, parentId: true, parentName: true, thumbnailUrl: true },
    });
    return cats;
  },
  ["all-categories-lite"],
  { revalidate: 3600, tags: [TAG_CATEGORIES] }
);

export const getCachedPreferredCategories = unstable_cache(
  async (): Promise<string[]> => {
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
    const allCategories: Array<{ id: string; name: string; parentId: string | null }> = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
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
  },
  ["preferred-category-ids"],
  { revalidate: 3600, tags: [TAG_CATEGORIES] }
);

export const getCachedDefaultHeroPool = unstable_cache(
  async (sourceCatIds: string[]): Promise<HeroProduct[]> => {
    return await prisma.$queryRaw<Array<{ id: number; name: string; imageUrl: string | null; category: string | null; categoryId: string | null }>>(
      Prisma.sql`
        SELECT "id", "name", "imageUrl", "category", "categoryId" FROM (
          SELECT "id", "name", "imageUrl", "category", "categoryId",
            ROW_NUMBER() OVER (PARTITION BY "categoryId" ORDER BY "id" DESC) as rn
          FROM "Product"
          WHERE "categoryId" IN (${Prisma.join(sourceCatIds)})
            AND "name" !~* ${blockedNameRegex()}
            AND "imageUrl" IS NOT NULL
        ) ranked
        WHERE rn <= 6
        ORDER BY rn ASC, "categoryId" ASC
        LIMIT 600
      `
    );
  },
  ["default-hero-pool"],
  { revalidate: 3600, tags: [TAG_CATEGORIES, TAG_PRODUCTS] }
);

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
  
  const sourceCatIds = await getCachedPreferredCategories();
  const allCats = await getCachedAllCategories();
  const catById = new Map(allCats.map((c) => [c.id, c]));

  if (sourceCatIds.length > 0) {
    const pool = await getCachedDefaultHeroPool(sourceCatIds);
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
 * How many cards the rail shows, and how many rows the query asks for.
 *
 * 30 is six full rows of the five-column grid. The gap between the two is the
 * moderation filter: filterHidden() drops rows after the query, so asking for
 * exactly SIMILAR_SHOWN would leave the rail short on any category holding
 * blocked items.
 */
export const SIMILAR_SHOWN = 30;
const SIMILAR_FETCH = SIMILAR_SHOWN * 3;

const SIMILAR_SELECT = { id: true, name: true, imageUrl: true, categoryId: true } as const;

/**
 * Products to show beneath a product, in two tiers.
 *
 * TIER 1 is the product's own category, which is all this ever did — and why
 * the rail sometimes came up nearly empty. Measured on the live catalogue:
 * 16 categories hold a single product, so those 16 pages rendered the heading
 * and no cards at all; 112 pages can show fewer than five, and 677 fewer than
 * twenty. Small against 1,079,241 pages, but those are precisely the pages
 * with the least to link to and the most to gain from links.
 *
 * TIER 2 fills the rest from sibling categories under the same parent, and
 * only when tier 1 came up short — so a large category is one query exactly as
 * before, and nothing about those pages changes. "Ladies Short Sleeve" holds
 * five products and sits under a parent holding 29,560; "Bird Accessories"
 * goes from 2 to 303.
 *
 * Sibling category ids are read from the Category table first (699 rows, and
 * cached) so the product query stays an indexed `categoryId IN (...)` rather
 * than a join through the relation.
 *
 * Deliberately no orderBy: sorting a large category by lastSynced forced a
 * full scan and was the main source of PDP latency. An arbitrary handful off
 * the index is what "similar" needs.
 *
 * Returns UNFILTERED rows on purpose. Moderation runs on the caller every
 * request, so a product blocked after this entry was cached still disappears
 * at once rather than lingering for the rest of the hour.
 */
export const getCachedSimilarProducts = unstable_cache(
  async (
    categoryId: string,
    excludeId: number,
    parentId: string | null,
  ): Promise<SimilarProduct[]> => {
    const own = await prisma.product.findMany({
      where: { categoryId, id: { not: excludeId }, imageUrl: { not: null } },
      take: SIMILAR_FETCH,
      select: SIMILAR_SELECT,
    });
    if (own.length >= SIMILAR_FETCH || !parentId) return own;

    const siblings = await prisma.category.findMany({
      where: { parentId, id: { not: categoryId } },
      select: { id: true },
    });
    if (siblings.length === 0) return own;

    const extra = await prisma.product.findMany({
      where: {
        categoryId: { in: siblings.map((c) => c.id) },
        id: { not: excludeId },
        imageUrl: { not: null },
      },
      take: SIMILAR_FETCH - own.length,
      select: SIMILAR_SELECT,
    });
    return [...own, ...extra];
  },
  ["pdp-similar-products"],
  { revalidate: 3600, tags: [TAG_CATEGORIES, TAG_PRODUCTS] }
);
