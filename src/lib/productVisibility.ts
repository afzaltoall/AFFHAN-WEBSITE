import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  blockedCategoryIdSet,
  isNameBlocked,
  isProductIdBlocked,
} from "@/lib/moderation";
import { TAG_CATEGORIES } from "@/lib/cacheTags";

/**
 * Is this product allowed to be shown at all?
 *
 * /api/products applies the three moderation rules in SQL, so a blocked product
 * never appears in a list, a facet, a search result or the mega-menu. The
 * product DETAIL page applied none of them: it was a bare
 * `findUnique({ where: { id } })`, so every hidden product stayed fully
 * readable at /products/<id>/ — including the three ids in
 * BLOCKED_PRODUCT_IDS, which exist precisely because someone had already found
 * them. Hiding a product from the grid while serving it a URL is not hiding it.
 *
 * The same gate covers the "similar products" rail, which is built from a
 * category query with no moderation clause of its own and could therefore
 * surface a blocked item next to an innocuous one.
 *
 * Kept as its own module rather than living in moderation.ts because it needs
 * the database and the Next cache; moderation.ts is deliberately pure so the
 * audit tooling can read the rules without pulling in Prisma.
 */

const loadTree = unstable_cache(
  async () => prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
  ["product-visibility-tree"],
  { revalidate: 3600, tags: [TAG_CATEGORIES] }
);

export interface VisibilityCandidate {
  id: number;
  name: string;
  categoryId: string | null;
}

/// The blocked-category id set, cached for an hour like the tree it is built
/// from. Recomputing it per product would walk 699 rows on every page view.
export async function blockedCategories(): Promise<Set<string>> {
  return blockedCategoryIdSet(await loadTree());
}

/// True when the product must not be served. Mirrors the three rules
/// /api/products applies in SQL, in the same order.
export async function isProductHidden(p: VisibilityCandidate): Promise<boolean> {
  if (isProductIdBlocked(p.id)) return true;
  if (isNameBlocked(p.name)) return true;
  if (!p.categoryId) return false;
  return (await blockedCategories()).has(p.categoryId);
}

/// Filter a list with one tree load, for rails that show many products.
export async function filterHidden<T extends VisibilityCandidate>(rows: T[]): Promise<T[]> {
  const blocked = await blockedCategories();
  return rows.filter(
    (p) =>
      !isProductIdBlocked(p.id) &&
      !isNameBlocked(p.name) &&
      !(p.categoryId && blocked.has(p.categoryId))
  );
}
