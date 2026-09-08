import { Prisma } from ".prisma/client";
import { prisma } from "./prisma";
import { unstable_cache } from "next/cache";
import { blockedNameRegex, isCategoryBlocked } from "@/lib/moderation";

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
  { revalidate: 3600 }
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
  ["category-product-count-v3"],
  { revalidate: 3600 }
);

export type CategoryLite = { id: string; name: string; parentId: string | null; parentName: string | null; thumbnailUrl: string | null };

export const getCachedAllCategories = unstable_cache(
  async (): Promise<CategoryLite[]> => {
    const cats = await prisma.category.findMany({
      select: { id: true, name: true, parentId: true, parentName: true, thumbnailUrl: true },
    });
    return cats;
  },
  ["all-categories-lite-v6"],
  { revalidate: 3600 }
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
  ["preferred-category-ids-v8"],
  { revalidate: 3600 }
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
  ["default-hero-pool-v1"],
  { revalidate: 3600 }
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
