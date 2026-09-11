import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FooterSection } from "@/components/sections/FooterSection";
import { ProductDetailView, type PDPProduct } from "@/components/ui/ProductDetailView";
import { RecordProductView } from "@/components/ui/RecordProductView";
import type { ProductCardData } from "@/components/ui/ProductCard";
import { getCategoryMeta } from "@/lib/categoryMeta";
import { parseDescription } from "@/lib/productDescription";
import { isProductHidden, filterHidden } from "@/lib/productVisibility";

export const dynamic = "force-dynamic";

const SITE = "https://affhan.com";

// Parse the JSON `allImages` (an array of CDN URL strings) defensively — some
// rows have `[]` or null, in which case the view falls back to `imageUrl`.
function parseImages(allImages: unknown): string[] {
  if (!Array.isArray(allImages)) return [];
  return allImages.filter((x): x is string => typeof x === "string" && x.length > 0);
}

async function getProduct(idParam: string) {
  const id = parseInt(idParam, 10);
  if (Number.isNaN(id)) return null;
  const product = await prisma.product.findUnique({ where: { id }, include: { categoryRef: true } });
  if (!product) return null;
  // A moderated product has no page. Without this the grid hid it and the URL
  // still served it in full — see src/lib/productVisibility.ts.
  if (await isProductHidden(product)) return null;
  return product;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  // notFound() here, not just in the page below. generateMetadata runs before
  // the response starts streaming, so this is the last moment the status code
  // can still be set: calling it in the component instead rendered the 404 UI
  // inside a response whose head had already gone out as 200, which is a soft
  // 404 — Google sees a successful page saying "not found" and indexes it.
  if (!product) notFound();
  // Read the description, never slice the raw string: an EPROLO description is
  // HTML, so `.slice(0, 155)` put `<p><table style="border-collapse: co` into
  // the meta description and the OpenGraph card of every EPROLO product.
  const parsed = parseDescription(product.description);
  const summary = [
    ...parsed.paragraphs,
    ...parsed.specs.map((s) => `${s.label}: ${s.value}`),
  ].join(" · ");
  const desc =
    summary.slice(0, 155) ||
    `Source ${product.name} through Affhan — request a quote and our team handles sourcing, quality control, and global shipping.`;
  return {
    title: `${product.name} | Affhan Sourcing`,
    description: desc,
    alternates: { canonical: `https://affhan.com/products/${product.id}/` },
    openGraph: {
      title: product.name,
      description: desc,
      images: product.imageUrl ? [product.imageUrl] : undefined,
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  // Similar products, and how many the category holds, fetched together so the
  // count costs no extra round trip. Both are served off the categoryId index.
  const [similarRows, categoryCount] = product.categoryId
    ? await Promise.all([
        prisma.product.findMany({
          where: {
            categoryId: product.categoryId,
            id: { not: product.id },
            imageUrl: { not: null },
          },
          // Over-fetch: the moderation filter below removes some of these, and
          // asking for exactly 10 would leave the rail short whenever it did.
          take: 24,
          // No orderBy: sorting a large category by lastSynced forced a full scan
          // of the category and was the main source of PDP latency. An arbitrary
          // handful served straight off the categoryId index is plenty for
          // "similar", and `select` avoids the categoryRef join entirely.
          select: { id: true, name: true, imageUrl: true, categoryId: true },
        }),
        prisma.product.count({ where: { categoryId: product.categoryId } }),
      ])
    : [[], 0];

  // Fetched once and used twice: the visible breadcrumb below and the
  // BreadcrumbList JSON-LD further down. They disagreed before — the schema had
  // the full trail, the page showed only the leaf — because the view was never
  // given this.
  const category = await getCategoryMeta(product.categoryId);

  const pdpProduct: PDPProduct = {
    id: product.id,
    name: product.name,
    categoryPath: category?.path ?? [],
    imageUrl: product.imageUrl,
    images: parseImages(product.allImages),
    description: product.description,
    categoryName: product.categoryRef?.name ?? product.category ?? null,
    categoryId: product.categoryId,
    // Built from our own row id. Never product.sku — every SKU in this
    // catalogue is a CJ code, and publishing one identifies the supplier and
    // lets anyone look the item up at its source price.
    reference: `AFF-${product.id}`,
    categoryCount,
  };

  // Every "similar" product shares this category, so reuse the parent's
  // category name for their card labels instead of joining categoryRef per row.
  //
  // Filtered first: this rail is a product list like any other, and a category
  // query with no moderation clause is exactly how a blocked item ends up shown
  // beside an innocuous one.
  const similar: ProductCardData[] = (await filterHidden(similarRows))
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      name: p.name,
      imageUrl: p.imageUrl,
      categoryRef: pdpProduct.categoryName ? { name: pdpProduct.categoryName } : null,
    }));

  // BreadcrumbList markup only. There is deliberately no Product schema here.
  //
  // Google requires a Product to carry one of offers, review or
  // aggregateRating, and we can honestly supply none of them. This catalogue
  // is a demonstrator of what we can source, not stock we hold, and the
  // supplier figure in the `price` column is not a price we charge — an
  // inquiry-only listing must not publish it as an Offer. We hold no review or
  // rating data of any kind, and inventing some to satisfy the validator would
  // breach Google's structured-data policy. So the markup was removed rather
  // than padded: Search Console's "Product snippets" warning is the correct
  // outcome for a page that is not a product offer, and it affects rich-result
  // eligibility only, never indexing or ranking.
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      // "All Categories", not "Products". The catalogue root is called that on
      // /products and now on this page's own breadcrumb too; the schema saying
      // something third was the last place the three disagreed.
      { "@type": "ListItem", position: 2, name: "All Categories", item: `${SITE}/products/` },
      ...(category?.path ?? []).map((step, i) => ({
        "@type": "ListItem",
        position: i + 3,
        name: step.name,
        item: `${SITE}/products/?categoryId=${step.id}`,
      })),
      {
        "@type": "ListItem",
        position: (category?.path.length ?? 0) + 3,
        name: product.name,
        item: `${SITE}/products/${product.id}/`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {/* Renders nothing; adds this product to the signed-in customer's own
          browsing history. Signed-out visitors record nothing at all. */}
      <RecordProductView productId={product.id} />
      <ProductDetailView product={pdpProduct} similar={similar} />
      <FooterSection />
    </>
  );
}
