import type { Metadata } from "next";
import { ProductsCatalogue } from "@/components/sections/ProductsCatalogue";
import { getCategoryMeta } from "@/lib/categoryMeta";

/**
 * The catalogue route, as a server component wrapping the client catalogue.
 *
 * It exists so that ?categoryId=… can have a <title> of its own. Metadata is
 * only handed searchParams in a page — never in a layout — so while the whole
 * route was one "use client" component, all 509 categories shared the generic
 * "Product Catalog" title, description and a canonical pointing at the bare
 * /products/. Google was being told 509 URLs were one page.
 *
 * The URL shape is deliberately unchanged: ?categoryId=… is what is already
 * indexed and linked, and a move to /products/category/<slug>/ would be a
 * migration with redirects, not a metadata fix.
 */

import { GET as getProducts } from "@/app/api/products/route";
import { GET as getCategories } from "@/app/api/categories/route";
import { headers } from "next/headers";
import { CATALOGUE_HERO_IMAGES } from "@/lib/catalogueHeroImages";

const SITE = "https://affhan.com";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const raw = params.categoryId;
  const categoryId = Array.isArray(raw) ? raw[0] : raw;
  const category = await getCategoryMeta(categoryId);

  // No category (or one that is blocked or no longer in CJ's tree): the
  // catalogue's own listing, canonical to itself. A ?q= search lands here too,
  // which is right — a search result page is the catalogue, not a page of its
  // own worth indexing separately.
  if (!category) {
    return {
      title: "Product Catalog | Affhan",
      description:
        "Browse Affhan's global sourcing catalog across hundreds of categories. Find a product like what you need and request a quote — we source, QC and ship it.",
      alternates: { canonical: `${SITE}/products/` },
      openGraph: {
        title: "Product Catalog | Affhan",
        description:
          "Browse Affhan's global sourcing catalog across hundreds of categories. Find a product like what you need and request a quote — we source, QC and ship it.",
        url: `${SITE}/products/`,
        type: "website",
        siteName: "Affhan",
        images: [{ url: "/images/logo.png", width: 800, height: 600 }],
      },
      twitter: {
        card: "summary_large_image",
        title: "Product Catalog | Affhan",
        description:
          "Browse Affhan's global sourcing catalog across hundreds of categories. Find a product like what you need and request a quote — we source, QC and ship it.",
      },
    };
  }

  const count = category.productCount.toLocaleString("en-US");
  const description =
    `Source ${category.name} in bulk from verified China suppliers. Browse ${count}+ ` +
    `${category.name} products, request quotes, and get factory-direct pricing through ` +
    `Affhan's global sourcing network.`;

  return {
    title: `${category.name} — Wholesale Suppliers & Bulk Sourcing | Affhan`,
    description,
    // Self-referencing, so each category is its own page rather than 509
    // duplicates of /products/.
    alternates: { canonical: `${SITE}/products/?categoryId=${category.id}` },
    openGraph: {
      title: `${category.name} — Wholesale Suppliers & Bulk Sourcing | Affhan`,
      description,
      url: `${SITE}/products/?categoryId=${category.id}`,
    },
  };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = params.categoryId;
  const categoryId = Array.isArray(raw) ? raw[0] : raw;
  const category = await getCategoryMeta(categoryId);

  // Also prefetch for ProductsCatalogue
  const q = params.q ? (Array.isArray(params.q) ? params.q[0] : params.q) : "";
  const sortBy = params.sortBy ? (Array.isArray(params.sortBy) ? params.sortBy[0] : params.sortBy) : "alpha";
  const pageStr = params.page ? (Array.isArray(params.page) ? params.page[0] : params.page) : "1";

  const headersList = await headers();
  const host = headersList.get("host") || "localhost";
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const queryParams = new URLSearchParams();
  if (q) queryParams.append("q", q);
  if (categoryId) queryParams.append("categoryId", categoryId);
  if (sortBy) queryParams.append("sortBy", sortBy);
  queryParams.append("page", pageStr);
  queryParams.append("limit", "96"); // PAGE_SIZE in catalogue
  const isDefaultView = !q && !categoryId;
  if (q || isDefaultView) queryParams.append("getChips", "true");

  const [categoriesRes, productsRes] = await Promise.all([
    getCategories(),
    getProducts(new Request(`${baseUrl}/api/products?${queryParams.toString()}`))
  ]);

  const categoriesJson = await categoriesRes.json();
  const productsJson = await productsRes.json();

  const initialCategories = categoriesJson.data || [];
  const initialProducts = productsJson.data || [];
  const initialFacets = productsJson.facets || [];
  const initialPagination = productsJson.pagination || { total: 0, totalPages: 1, totalCapped: false };

  // Mirrors the breadcrumb the page already draws above the grid, which is
  // what BreadcrumbList is for — markup that agrees with what the visitor
  // sees, not a second, invented hierarchy.
  const breadcrumb = category && {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Products", item: `${SITE}/products/` },
      ...category.path.map((step, i) => ({
        "@type": "ListItem",
        position: i + 3,
        name: step.name,
        item: `${SITE}/products/?categoryId=${step.id}`,
      })),
    ],
  };

  return (
    <>
      {/* The opening hero's four cards, fetched before React asks for them.
          They are rendered by a client component behind a `mounted` gate, so
          they reach the DOM only after hydration — measured at 3,174ms on a
          4 Mbps connection, spent purely waiting to be discovered. React
          hoists these to the TOP of <head>, ahead of the 209 KB inlined
          stylesheet, where the HTML preload scanner finds them in the first
          few hundred bytes of the document.

          Rendered as <link>, not ReactDOM.preload(). preload() called in a
          server component emits only an RSC flight hint, which React acts on
          during hydration — the exact moment this is meant to beat. Measured:
          preload() produced zero <link> tags in the HTML.

          React does hoist a copy and leave the original, so the tag appears
          twice in <head> (~370 bytes). The browser fetches once. Not worth
          trading the early placement to avoid.

          The cost is 49 KB fetched on a deep link into a category, where the
          hero never renders. That is the trade: 49 KB against a three-second
          delay on the default view, which is the common one. */}
      {CATALOGUE_HERO_IMAGES.map((src) => (
        <link key={src} rel="preload" as="image" href={src} fetchPriority="high" />
      ))}
      {breadcrumb && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
        />
      )}
      <ProductsCatalogue 
         initialProducts={initialProducts} 
         initialCategories={initialCategories}
         initialFacets={initialFacets}
         initialPagination={initialPagination}
      />
    </>
  );
}
