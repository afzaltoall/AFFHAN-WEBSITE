import { prisma } from "@/lib/prisma";
import { blockedCategoryIdSet } from "@/lib/moderation";
import { TAG_CATEGORIES } from "@/lib/cacheTags";
import { cachedOnce } from "@/lib/cachedOnce";
import { sumProductCounts } from "@/lib/categoryCounts";

/**
 * What a category page needs to describe itself to a search engine: its name,
 * where it sits in the tree, and how much is in it.
 *
 * Kept apart from /api/categories because that route serves the whole 609-row
 * taxonomy to the browser, and a <title> needs one row. Both read the same
 * table and both respect the same moderation list — a blocked category has no
 * indexable page any more than it has a menu entry.
 *
 * The count is recursive: products in this category and in everything beneath
 * it, which is the figure the catalogue itself shows. CJ attaches products
 * only to leaves, so the direct count of any branch node is zero and a
 * description built on it would read "Browse 0+ Men's Clothing products".
 */

export interface CategoryMeta {
  id: string;
  name: string;
  /** Root first, this category last — the order a breadcrumb reads in. */
  path: { id: string; name: string }[];
  productCount: number;
}

// With each category's stored count (Category.productCount, refreshed daily
// by lib/snapshots.ts), so the subtree's figure is a sum here rather than a
// COUNT over its products: a crawler walking 509 categories ran 509 of those.
const loadTree = cachedOnce(
  async () =>
    prisma.category.findMany({ select: { id: true, name: true, parentId: true, productCount: true } }),
  ["category-meta-tree"],
  { revalidate: 3600, tags: [TAG_CATEGORIES] }
);

export async function getCategoryMeta(categoryId: string | null | undefined): Promise<CategoryMeta | null> {
  if (!categoryId) return null;

  const rows = await loadTree();
  const byId = new Map(rows.map((c) => [c.id, c]));
  const self = byId.get(categoryId);
  if (!self) return null;

  // Blocked categories are absent from the menu and the catalogue; giving one
  // a title, a description and a canonical would be publishing the page we
  // deliberately do not show.
  if (blockedCategoryIdSet(rows).has(categoryId)) return null;

  const path: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  let cur: typeof self | undefined = self;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift({ id: cur.id, name: cur.name });
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  const childrenOf = new Map<string, string[]>();
  for (const c of rows) {
    if (!c.parentId) continue;
    const list = childrenOf.get(c.parentId);
    if (list) list.push(c.id);
    else childrenOf.set(c.parentId, [c.id]);
  }
  const ids: string[] = [];
  const walk = (id: string) => {
    ids.push(id);
    for (const child of childrenOf.get(id) ?? []) walk(child);
  };
  walk(categoryId);

  return { id: self.id, name: self.name, path, productCount: sumProductCounts(rows, ids) };
}
