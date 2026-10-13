import { NextResponse } from "next/server";
import { GET as getCategories } from "@/app/api/categories/route";
import { getCdnUrl } from "@/lib/cdn";
import { MODERATION_SENSITIVE_CACHE_CONTROL } from "@/lib/cacheTags";

export const dynamic = "force-dynamic";

interface CategoryRow {
  id: string;
  name: string;
  parentId: string | null;
  displayLabel?: string | null;
  thumbnailUrl: string | null;
  productCount: number;
}

/**
 * The phone search box's rotating hint (components/mobile/PhoneChrome.tsx):
 * ten of the catalogue's big second-level categories ("Mobile Phone
 * Accessories", "Lighting"), the largest with a picture in each of ten
 * families, so the hint wanders (phones, then dresses, then lighting)
 * instead of naming five kinds of shirt in a row; each with its picture made
 * small (64px). Second-level, as the leaves read badly out of context
 * ("Print", "Other Replacement Parts"), and counted with everything under
 * them. A few hundred bytes, where the box's whole engine (searchKit: every
 * category and the phrase lexicon, ~360KB) loads only once someone starts
 * typing.
 *
 * The same source and the same moderation as the categories API, through its
 * own handler, as the homepage reads it.
 */
export async function GET() {
  try {
    const res = await getCategories();
    const json = (await res.json()) as { data?: CategoryRow[] };
    const cats = json.data ?? [];
    const byId = new Map(cats.map((c) => [String(c.id), c]));
    const kids = new Map<string, CategoryRow[]>();
    for (const c of cats) {
      if (!c.parentId || !byId.has(String(c.parentId))) continue;
      const p = String(c.parentId);
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p)!.push(c);
    }
    const totals = new Map<string, number>();
    const total = (c: CategoryRow, depth = 0): number => {
      const id = String(c.id);
      if (totals.has(id)) return totals.get(id)!;
      const n = (c.productCount || 0) + (depth > 6 ? 0 : (kids.get(id) ?? []).reduce((s, k) => s + total(k, depth + 1), 0));
      totals.set(id, n);
      return n;
    };
    const roots = cats.filter((c) => !c.parentId || !byId.has(String(c.parentId)));
    const popular = roots
      .map((root) =>
        (kids.get(String(root.id)) ?? [])
          .filter((c) => c.thumbnailUrl && !/^other\b/i.test(c.displayLabel || c.name))
          .map((c) => ({ c, n: total(c) }))
          .filter((x) => x.n > 0)
          .sort((a, b) => b.n - a.n)[0],
      )
      .filter((x): x is { c: CategoryRow; n: number } => !!x)
      .sort((a, b) => b.n - a.n)
      .slice(0, 10)
      .map(({ c }) => ({ id: String(c.id), name: c.displayLabel || c.name, image: getCdnUrl(c.thumbnailUrl, 64) }));
    return NextResponse.json({ popular }, { headers: { "Cache-Control": MODERATION_SENSITIVE_CACHE_CONTROL } });
  } catch (e) {
    console.error("popular searches:", e instanceof Error ? e.message : e);
    return NextResponse.json({ popular: [] }, { status: 500 });
  }
}
