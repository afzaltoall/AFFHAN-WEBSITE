import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { unstable_cache } from "next/cache";
import { Category } from ".prisma/client";
import { blockedCategoryIdSet } from "@/lib/moderation";
import { TAG_CATEGORIES, TAG_PRODUCTS, MODERATION_SENSITIVE_CACHE_CONTROL } from "@/lib/cacheTags";

type CategoryWithCount = Category & {
  _count: { products: number };
};

export const dynamic = "force-dynamic";

const getCachedCategories = unstable_cache(
  async (): Promise<{ data: (Category & { productCount: number })[]; totalCount: number }> => {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { products: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    const totalProducts = await prisma.product.count();

    // Drop moderation-blocked categories (and every descendant of a blocked
    // parent) so they never appear in the mega-menu, catalog tree, rankings
    // scope or search facets.
    const blocked = blockedCategoryIdSet(categories);
    const formattedCategories = categories
      .filter((cat: CategoryWithCount) => !blocked.has(cat.id))
      .map((cat: CategoryWithCount) => ({
        ...cat,
        productCount: cat._count.products
      }));

    return { data: formattedCategories, totalCount: totalProducts };
  },
  ["categories-api-data"],
  { revalidate: 3600, tags: [TAG_CATEGORIES, TAG_PRODUCTS] }
);

export async function GET() {
  // Retry the transient concurrent-cache race (see products route) before 500.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const cached = await getCachedCategories();
      // The unstable_cache above already spares Postgres, but with
      // force-dynamic the function still wakes and re-serialises ~180KB for
      // every caller, so the edge is still worth having in front of it.
      //
      // It used to hold for an hour and then serve stale for a further day.
      // That was written when the taxonomy was CJ's 634 fixed nodes and the
      // only thing that changed was thumbnails. Neither is true now: categories
      // are merged and deleted here, and — the reason this is short rather than
      // merely shorter — a category can need blocking on content-safety
      // grounds, which has happened once already.
      return NextResponse.json(
        {
          success: true,
          data: cached.data,
          totalCount: cached.totalCount,
        },
        {
          headers: {
            "Cache-Control": MODERATION_SENSITIVE_CACHE_CONTROL,
          },
        }
      );
    } catch (error: unknown) {
      lastError = error;
      console.error(`Failed to fetch categories (attempt ${attempt + 1}/3):`, error);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
        continue;
      }
    }
  }
  console.error("Categories request failed after retries:", lastError);
  return NextResponse.json(
    { success: false, error: "Internal Server Error", data: [], totalCount: 0 },
    { status: 500 }
  );
}
