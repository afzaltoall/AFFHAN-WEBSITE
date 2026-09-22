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
import { getCachedSimilarProducts, SIMILAR_SHOWN } from "@/lib/products";

export const dynamic = "force-dynamic";

const SITE = "https://affhan.com";

// Parse the JSON `allImages` (an array of CDN URL strings) defensively — some
// rows have `[]` or null, in which case the view falls back to `imageUrl`.
function parseImages(allImages: unknown): string[] {
  if (!Array.isArray(allImages)) return [];
  return allImages.filter((x): x is string => typeof x === "string" && x.length > 0);
}

/** Google shows about this much of a title before cutting it off. */
const TITLE_MAX = 60;
const TITLE_SUFFIX = " | Affhan";
/** Below this there is no room left to say what the thing actually is. */
const MIN_NAME = 24;
const DESC_MAX = 155;

/**
 * Cut at a word boundary, never through the middle of a word.
 *
 * `.slice(155)` was landing mid-word — one live description ended
 * "...attractive for a long time" with the sentence unfinished and no marker
 * that anything had been removed, and product names fared worse because they
 * are strings of loosely joined keywords. The ellipsis is inside the budget,
 * not added to it, so the result is never longer than `max`.
 *
 * The half-length guard stops a single very long word collapsing the string to
 * almost nothing: if the last space sits in the first half, a hard cut is the
 * better of two bad options.
 */
function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut;
  return body.replace(/[\s,;:.\-–—·|]+$/, "") + "…";
}

/**
 * "<name> | <category> | Affhan", within 60 characters.
 *
 * The category earns its place only when the name still has room to be
 * recognisable afterwards; on a long name it is dropped rather than squeezing
 * the part a reader actually searches for. Every title in this catalogue used
 * to be the raw product name plus " | Affhan Sourcing" — 112 characters on a
 * measured live page, so roughly half of it never reached a search result.
 */
function productTitle(name: string, category: string | null): string {
  const tail = category ? ` | ${category}` : "";
  const useCategory = Boolean(category) && TITLE_MAX - TITLE_SUFFIX.length - tail.length >= MIN_NAME;
  const room = TITLE_MAX - TITLE_SUFFIX.length - (useCategory ? tail.length : 0);
  return clip(name, room) + (useCategory ? tail : "") + TITLE_SUFFIX;
}

/**
 * The sentence under the title, from the product's own words where it has any.
 *
 * CJ sends no description at all for the great majority of this catalogue, so
 * the fallback is not an edge case — it is what most of these pages use.
 */
function productDescription(
  parsed: ReturnType<typeof parseDescription>,
  name: string,
): string {
  const summary = [
    ...parsed.paragraphs,
    ...parsed.specs.map((sp) => `${sp.label}: ${sp.value}`),
  ].join(" · ");
  if (summary.trim()) return clip(summary, DESC_MAX);
  return clip(
    `Source ${name} through Affhan — request a quote and our team handles sourcing, quality control, and global shipping.`,
    DESC_MAX,
  );
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
  const desc = productDescription(parsed, product.name);
  const title = productTitle(
    product.name,
    product.categoryRef?.name ?? product.category ?? null,
  );
  return {
    title,
    description: desc,
    alternates: { canonical: `https://affhan.com/products/${product.id}/` },
    openGraph: {
      title,
      description: desc,
      url: `https://affhan.com/products/${product.id}/`,
      type: "website",
      siteName: "Affhan",
      images: product.imageUrl ? [product.imageUrl] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
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
  // The rail's rows now come from getCachedSimilarProducts — same query, moved
  // into lib/products.ts and wrapped in unstable_cache like every other
  // catalogue read. It over-fetches for the moderation filter below; see
  // SIMILAR_SHOWN / SIMILAR_FETCH there.
  const [similarRows, categoryCount] = product.categoryId
    ? await Promise.all([
        getCachedSimilarProducts(product.categoryId, product.id),
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
    .slice(0, SIMILAR_SHOWN)
    .map((p) => ({
      id: p.id,
      name: p.name,
      imageUrl: p.imageUrl,
      categoryRef: pdpProduct.categoryName ? { name: pdpProduct.categoryName } : null,
    }));

  // A Product node WITHOUT offers, review or aggregateRating, and that
  // omission is deliberate and permanent.
  //
  // Google requires a Product to carry one of those three to be eligible for a
  // product rich result, and we can honestly supply none. This catalogue is a
  // demonstrator of what we can source, not stock we hold; the supplier figure
  // in the `price` column is not a price we charge, so an inquiry-only listing
  // must not publish it as an Offer, and we hold no review or rating data of
  // any kind. Inventing either to satisfy the validator would breach Google's
  // structured-data policy.
  //
  // The node was previously removed altogether for that reason. It is back
  // because the two questions are separate: the rich result is unavailable
  // either way, but the name, image, category and description are true and
  // worth stating as an entity rather than leaving Google to infer them from
  // the markup. The cost is a "Missing field offers" WARNING in Search
  // Console, which affects rich-result eligibility only — never indexing or
  // ranking. If that warning is not worth the entity data, revert this commit
  // and the page is exactly as it was.
  //
  // sku is our own AFF- reference, the one already printed on the page and
  // built from our row id. NEVER product.sku: every SKU in this catalogue is a
  // CJ code, and publishing one identifies the supplier and lets anyone look
  // the item up at its source price.
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url: `${SITE}/products/${product.id}/`,
    sku: pdpProduct.reference,
    ...(pdpProduct.images.length || product.imageUrl
      ? { image: (pdpProduct.images.length ? pdpProduct.images : [product.imageUrl!]).slice(0, 6) }
      : {}),
    ...(pdpProduct.categoryName ? { category: pdpProduct.categoryName } : {}),
    description: productDescription(parseDescription(product.description), product.name),
  };

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
