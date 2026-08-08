import { NextRequest, NextResponse } from "next/server";
import { Prisma } from ".prisma/client";
import { prisma } from "@/lib/prisma";
import { parseQuery, buildSearchWhere, buildRelevanceExpr } from "@/lib/search";
import { isCategoryBlocked, isNameBlocked } from "@/lib/moderation";

export const dynamic = "force-dynamic";

// Live autocomplete. Returns matching CATEGORIES (so "sh" surfaces "Shirts",
// "Shoes"…) and top-ranked PRODUCTS, using the shared search core so the
// dropdown ranks results exactly like the full results page.
export async function GET(request: NextRequest) {
  try {
    const pq = parseQuery(request.nextUrl.searchParams.get("q"));
    if (!pq.isValid) {
      return NextResponse.json({ categories: [], products: [], suggestions: [] });
    }

    // prefix: true — the last word is still being typed, so "cabl" matches
    // "cable" for live-as-you-type autocomplete.
    const where = buildSearchWhere(pq, { prefix: true });
    const relevance = buildRelevanceExpr(pq, { prefix: true });

    // Category matches: every token must appear in the category name, only
    // product-bearing categories (thumbnailUrl is the "has products" proxy),
    // prefix matches first then shortest/most-relevant names.
    const catTokenClauses = pq.tokens.map((tok) => {
      const like = `%${tok.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      return Prisma.sql`"name" ILIKE ${like}`;
    });
    const catWhere = catTokenClauses.length
      ? Prisma.sql`(${Prisma.join(catTokenClauses, " AND ")})`
      : Prisma.sql`"name" ILIKE ${`%${pq.phrase}%`}`;
    const prefixLike = `${pq.phrase.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

    const [categories, products] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string; name: string; parentName: string | null; thumbnailUrl: string | null }>>(
        Prisma.sql`
          SELECT "id", "name", "parentName", "thumbnailUrl"
          FROM "Category"
          WHERE ${catWhere} AND "thumbnailUrl" IS NOT NULL
          ORDER BY ("name" ILIKE ${prefixLike}) DESC, length("name") ASC, "name" ASC
          LIMIT 6
        `
      ),
      prisma.$queryRaw<Array<{ id: number; name: string; imageUrl: string | null; category: string | null; categoryName: string | null }>>(
        Prisma.sql`
          SELECT p."id", p."name", p."imageUrl", p."category", c."name" AS "categoryName"
          FROM "Product" p
          LEFT JOIN "Category" c ON p."categoryId" = c."id"
          WHERE ${where}
          ORDER BY ${relevance} DESC, p."id" DESC
          LIMIT 14
        `
      ),
    ]);

    // Drop moderation-blocked categories and products from autocomplete. A leaf
    // whose parent is blocked (e.g. "Boxers" under "Underwear & Loungewear") is
    // dropped too.
    const visibleCategories = categories
      .filter((c) => !isCategoryBlocked(c.name) && !isCategoryBlocked(c.parentName))
      .slice(0, 6);
    const mappedProducts = products
      .filter((p) => !isCategoryBlocked(p.categoryName) && !isNameBlocked(p.name))
      .slice(0, 7)
      .map((p) => ({
        id: p.id,
        name: p.name,
        imageUrl: p.imageUrl,
        category: p.categoryName || p.category,
        categoryRef: p.categoryName ? { name: p.categoryName } : null,
      }));

    // `suggestions` kept for backward-compatibility with older callers.
    return NextResponse.json({ categories: visibleCategories, products: mappedProducts, suggestions: mappedProducts });
  } catch (error) {
    console.error("Search suggestions error:", error);
    return NextResponse.json({ categories: [], products: [], suggestions: [] }, { status: 500 });
  }
}
