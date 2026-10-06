import { NextRequest, NextResponse } from "next/server";
import { isCategoryBlocked } from "@/lib/moderation";
import { MODERATION_SENSITIVE_CACHE_CONTROL } from "@/lib/cacheTags";
import { categoryCard, resolveSearch, suggestProducts, suggestText } from "@/lib/searchServer";

export const dynamic = "force-dynamic";

/**
 * Live autocomplete (lib/searchServer.ts): what a query is read as, what to
 * complete it to, the categories it names, and a few products, ranked the way
 * the results page ranks them.
 *
 * The site's own search boxes work out the completions and categories in the
 * browser as each key is pressed (SearchAssist) and only need the products
 * from here; the rest is for anything that asks this endpoint alone (the
 * app). The response keeps the old shape (`categories`, `products`,
 * `suggestions`) and adds to it.
 *
 * The same query gets the same answer for everyone, so the edge keeps it for
 * a minute: a popular prefix is served without waking the function.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 120);
  if (!q.trim()) return NextResponse.json({ categories: [], products: [], suggestions: [], completions: [] });
  try {
    const r = await resolveSearch(q, { typing: true });
    const [products, text] = await Promise.all([suggestProducts(r, 7), suggestText(q, 8)]);
    const categories = (await Promise.all(text.categories.map((c) => categoryCard(c.id))))
      .filter((c): c is NonNullable<typeof c> => !!c && !isCategoryBlocked(c.name) && !isCategoryBlocked(c.parentName))
      .slice(0, 6);
    const mapped = products.map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl, category: p.category, categoryRef: p.category ? { name: p.category } : null }));
    return NextResponse.json(
      {
        intent: {
          text: r.intent.text,
          corrected: r.corrected ? r.intent.text : null,
          original: r.read.text,
          budget: r.intent.budget,
          quantity: r.intent.quantity,
          primary: r.categories.primary.map((h) => ({ id: h.id, name: h.name, total: h.total })),
        },
        completions: text.completions,
        categories,
        products: mapped,
        suggestions: mapped,
      },
      { headers: { "Cache-Control": MODERATION_SENSITIVE_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("Search suggestions error:", error);
    return NextResponse.json({ categories: [], products: [], suggestions: [], completions: [] }, { status: 500 });
  }
}
