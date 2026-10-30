import { blockedCategoryIdSet } from "@/lib/moderation";
import { getCachedAllCategories, getCachedProductCount } from "@/lib/products";
import { sumProductCounts } from "@/lib/categoryCounts";
import { categoryLabel } from "@/lib/searchIntent";
import { cachedOnce } from "@/lib/cachedOnce";
import { TAG_CATEGORIES } from "@/lib/cacheTags";
import { prisma } from "@/lib/prisma";

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
  /** Its picture (scripts/assign_category_thumbnails.mjs), or its biggest kind's when it has none of its own. */
  thumbnailUrl: string | null;
}

/** A family's group (the tree's second level), with its kinds: the phone's "Select category" shows them all. */
export interface SupplierGroup extends SupplierCategory {
  kinds: SupplierCategory[];
}

export interface SupplierFamily extends SupplierCategory {
  children: SupplierGroup[];
}

/**
 * The catalogue's top-level families, each with its groups and their kinds, biggest first, moderated ones and
 * empty ones left out. The real tree only: the copies the homepage promotes to the top (displayAsTopLevel)
 * would list a category twice here, which is a filter, not a shop window.
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
  const byCount = <T extends SupplierCategory>(a: T, b: T) => b.count - a.count || a.name.localeCompare(b.name);
  const counted = (c: (typeof shown)[number]): SupplierCategory => ({
    id: c.id,
    name: categoryLabel(c.name, c.parentName),
    count: sumProductCounts(all, subtree(c.id)),
    thumbnailUrl: c.thumbnailUrl ?? null,
  });
  const below = (id: string) =>
    (children.get(id) ?? [])
      .map(counted)
      .filter((c) => c.count > 0)
      .sort(byCount);
  /** Its own picture, or the first of its biggest kinds' that has one. */
  const pictured = <T extends SupplierCategory>(c: T, under: SupplierCategory[]): T => ({
    ...c,
    thumbnailUrl: c.thumbnailUrl ?? under.find((k) => k.thumbnailUrl)?.thumbnailUrl ?? null,
  });
  return shown
    .filter((c) => !c.parentId)
    .map((root) => {
      const groups = below(root.id).map((g) => {
        const kinds = below(g.id);
        return { ...pictured(g, kinds), kinds };
      });
      return { ...pictured(counted(root), groups), children: groups };
    })
    .filter((f) => f.count > 0)
    .sort(byCount);
}

/** The categories the site lifts to the top beside the families (Category.displayAsTopLevel), and the names they go by there. */
const getCachedLifted = cachedOnce(
  async (): Promise<Array<{ id: string; displayLabel: string | null }>> =>
    prisma.category.findMany({ where: { displayAsTopLevel: true }, select: { id: true, displayLabel: true } }),
  ["supplier-lifted-categories"],
  { revalidate: 3600, tags: [TAG_CATEGORIES] },
);

/** A row of the portal's category list on a computer. */
export interface RailEntry {
  id: string;
  name: string;
  /** Products in it and every category under it. */
  count: number;
  /** Its picture, or its biggest category's when it has none of its own, as the navbar's tiles take theirs. */
  thumbnailUrl: string | null;
}

/**
 * The portal's category list on a computer: the shop's own All Categories, as the navbar's panel lists it (the
 * owner, 2026-10-29: "from this all catgeories from navbar this full set ... have to show in ... supplier
 * catgroies"). Every family, and beside them the categories the site lifts to the top (Furniture, Earrings,
 * Women's Shoes...) under the names it gives them there, each once, biggest first, moderated and empty ones left
 * out; what is lifted is still under its family too. The same rules as buildCategoryTree (lib/categoryTree.ts),
 * read here on the server so the list is in the page from its first paint.
 */
export async function supplierRail(): Promise<RailEntry[]> {
  const [all, lifted] = await Promise.all([getCachedAllCategories(), getCachedLifted()]);
  const blocked = blockedCategoryIdSet(all);
  const shown = all.filter((c) => !blocked.has(c.id));
  const byId = new Map(shown.map((c) => [c.id, c]));
  const children = new Map<string, string[]>();
  for (const c of shown) {
    if (!c.parentId) continue;
    const list = children.get(c.parentId) ?? [];
    list.push(c.id);
    children.set(c.parentId, list);
  }
  const subtree = (id: string): string[] => [id, ...(children.get(id) ?? []).flatMap(subtree)];
  const count = (id: string) => sumProductCounts(all, subtree(id));
  const picture = (id: string): string | null =>
    byId.get(id)?.thumbnailUrl ||
    (children.get(id) ?? [])
      .filter((k) => count(k) > 0)
      .sort((a, b) => count(b) - count(a))
      .reduce<string | null>((found, k) => found ?? picture(k), null);
  const entry = (id: string, name: string, family: boolean) => ({ id, name, count: count(id), family, thumbnailUrl: picture(id) });
  const families = shown.filter((c) => !c.parentId || !byId.has(c.parentId)).map((c) => entry(c.id, c.name, true));
  const raised = lifted.flatMap((l) => {
    const c = byId.get(l.id);
    // Already at the top, or under a category that is not shown: not drawn twice, nor without its family.
    return c?.parentId && byId.has(c.parentId) ? [entry(c.id, l.displayLabel || c.name, false)] : [];
  });
  return [...families, ...raised]
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count || Number(b.family) - Number(a.family) || a.name.localeCompare(b.name))
    .map(({ id, name, count, thumbnailUrl }) => ({ id, name, count, thumbnailUrl }));
}
