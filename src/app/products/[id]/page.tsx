import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FooterSection } from "@/components/sections/FooterSection";
import { ProductDetailView, type PDPProduct } from "@/components/ui/ProductDetailView";
import type { ProductCardData } from "@/components/ui/ProductCard";

export const dynamic = "force-dynamic";

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
  if (!product) return { title: "Product not found | Affhan Group" };
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

  return (
    <>
      <ProductDetailView product={pdpProduct} similar={similar} />
      <FooterSection />
    </>
  );
}
