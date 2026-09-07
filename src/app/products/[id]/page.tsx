import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FooterSection } from "@/components/sections/FooterSection";
import { ProductDetailView, type PDPProduct } from "@/components/ui/ProductDetailView";
import { RecordProductView } from "@/components/ui/RecordProductView";
import type { ProductCardData } from "@/components/ui/ProductCard";
import { getCategoryMeta } from "@/lib/categoryMeta";

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
  return prisma.product.findUnique({ where: { id }, include: { categoryRef: true } });
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
  const desc =
    product.description?.slice(0, 155) ||
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
          take: 10,
          // No orderBy: sorting a large category by lastSynced forced a full scan
          // of the category and was the main source of PDP latency. An arbitrary
          // 10 served straight off the categoryId index is plenty for "similar",
          // and `select` avoids the categoryRef join entirely.
          select: { id: true, name: true, imageUrl: true },
        }),
        prisma.product.count({ where: { categoryId: product.categoryId } }),
      ])
    : [[], 0];

  const pdpProduct: PDPProduct = {
    id: product.id,
    name: product.name,
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
  const similar: ProductCardData[] = similarRows.map((p) => ({
    id: p.id,
    name: p.name,
    imageUrl: p.imageUrl,
    categoryRef: pdpProduct.categoryName ? { name: pdpProduct.categoryName } : null,
  }));

  // Product and BreadcrumbList markup.
  //
  // No offers, no price, no availability: this catalogue is a demonstrator of
  // what we can source, not stock we hold, and the CJ figure in the `price`
  // column is a supplier's dollar price rather than ours. Publishing it as an
  // Offer would state a price we do not charge for goods we do not have.
  // Without an Offer the page is not eligible for a price-carrying rich
  // result, which is correct — an inquiry-only listing should not claim one.
  //
  // sku is our own AFF- reference, never product.sku: every SKU in this table
  // is a CJ code, and publishing one names the supplier.
  const category = await getCategoryMeta(product.categoryId);
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: pdpProduct.reference,
    url: `${SITE}/products/${product.id}/`,
    ...(pdpProduct.images.length > 0 || product.imageUrl
      ? { image: pdpProduct.images.length > 0 ? pdpProduct.images : [product.imageUrl as string] }
      : {}),
    ...(product.description ? { description: product.description.slice(0, 500) } : {}),
    ...(pdpProduct.categoryName ? { category: pdpProduct.categoryName } : {}),
    brand: { "@type": "Organization", name: "AFFHAN International Pvt Ltd" },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Products", item: `${SITE}/products/` },
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />
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
