import { blockedCategoryIdSet } from "@/lib/moderation";
import { getCachedAllCategories, getCachedProductCount } from "@/lib/products";
import { sumProductCounts } from "@/lib/categoryCounts";
import { categoryLabel } from "@/lib/searchIntent";

// ---------------------------------------------------------------------------
// The catalogue as the supplier portal shows it: the figure on its pages, and
// the families a supplier browses by. Both from what the daily refresh stores
// (lib/snapshots.ts), so no page here counts a million rows.
// ---------------------------------------------------------------------------

/** Resolves to null rather than waiting: a slow figure must not hold a sign-in page. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([work, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** Products in the catalogue, or null when the figure could not be read in time. Never a zero for "unknown". */
export async function catalogueCount(): Promise<number | null> {
  try {
    const n = await withTimeout(getCachedProductCount(), 2500);
    return typeof n === "number" && n > 0 ? n : null;
  } catch (error) {
    console.error("supplier portal catalogue count failed:", error instanceof Error ? error.name : "unknown");
    return null;
  }
}

export interface SupplierCategory {
  id: string;
  /** As the site labels it ("Solid T-Shirts" for "Solid" under T-Shirts). */
  name: string;
  /** Products in it and every category under it. */
  count: number;
}

export interface SupplierFamily extends SupplierCategory {
  children: SupplierCategory[];
}

/**
 * The catalogue's top-level families with the categories directly under each, biggest first, moderated ones
 * left out. The real tree only: the copies the homepage promotes to the top (displayAsTopLevel) would list a
 * category twice here, which is a filter, not a shop window.
 */
export async function supplierFamilies(): Promise<SupplierFamily[]> {
  const all = await getCachedAllCategories();
  const blocked = blockedCategoryIdSet(all);
  const shown = all.filter((c) => !blocked.has(c.id));
  const children = new Map<string, typeof shown>();
  for (const c of shown) {
    if (!c.parentId) continue;
    const list = children.get(c.parentId) ?? [];
    list.push(c);
    children.set(c.parentId, list);
  }
  const subtree = (id: string): string[] => [id, ...(children.get(id) ?? []).flatMap((c) => subtree(c.id))];
  const counted = (c: (typeof shown)[number]): SupplierCategory => ({
    id: c.id,
    name: categoryLabel(c.name, c.parentName),
    count: sumProductCounts(all, subtree(c.id)),
  });
  const byCount = (a: SupplierCategory, b: SupplierCategory) => b.count - a.count || a.name.localeCompare(b.name);
  return shown
    .filter((c) => !c.parentId)
    .map((root) => ({
      ...counted(root),
      children: (children.get(root.id) ?? []).map(counted).filter((c) => c.count > 0).sort(byCount),
    }))
    .filter((f) => f.count > 0)
    .sort(byCount);
}
