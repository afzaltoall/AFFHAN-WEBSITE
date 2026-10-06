import { NextRequest, NextResponse } from "next/server";
import { Prisma } from ".prisma/client";
import { prisma } from "@/lib/prisma";
import { GET as searchProducts } from "@/app/api/products/route";
import { isCategoryBlocked, isNameBlocked } from "@/lib/moderation";
import {
  describeProductImage,
  fetchRemoteImage,
  normaliseForProvider,
  ImageSearchUnavailable,
  ImageSearchBusy,
  ImageDecodeFailed,
  RemoteImageRefused,
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  type DetectedItem,
  type ImageDescription,
} from "@/lib/imageSearch";
import { checkImageSearchRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
/** Vision call plus a catalogue query. Comfortably inside the Hobby limit, but
 *  worth stating rather than inheriting the default. */
export const maxDuration = 30;

type Hit = { id: number; name: string; imageUrl: string | null; category: string | null };
/** `best`: the category the words name, rather than one the matches happen to sit in. */
type Cat = { id: string; name: string; parentName: string | null; total: number; best?: boolean };
type Found = { query: string; products: Hit[]; categories: Cat[]; total: number; capped: boolean; loose: boolean };

/** Products sent back with the photo; the rest are a link away on /products/?q=. */
const SHOWN = 24;

/**
 * The catalogue's own search (/api/products, lib/searchServer.ts) for one
 * item's words, so a photo finds what the same words typed would: the
 * category they name first, synonyms, typos, accessories sunk below the
 * thing itself, moderation, close matches when nothing has every word. The
 * first version ran a search of its own on the older query builder, and
 * none of that reached it.
 */
async function searchFor(query: string, origin: string): Promise<Found> {
  const params = new URLSearchParams({ q: query, limit: String(SHOWN), page: "1", sortBy: "relevance", getChips: "true" });
  const res = await searchProducts(new Request(new URL(`/api/products?${params}`, origin)));
  const j = (await res.json()) as {
    data?: { id: number; name: string; imageUrl: string | null; category: string | null; categoryRef?: { name: string | null } | null }[];
    facets?: { id: string; name: string; parentName: string | null; count: number }[];
    search?: { primary?: { id: string; name: string; total: number; path?: string[] }[]; loose?: boolean } | null;
    pagination?: { total?: number; totalCapped?: boolean };
  };
  const products = (j.data ?? [])
    .filter((p) => !isNameBlocked(p.name))
    .map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl ?? null, category: p.categoryRef?.name ?? p.category ?? null }));
  // The category the words name first, then the ones the matches sit in.
  const seen = new Set<string>();
  const categories: Cat[] = [];
  for (const c of [
    ...(j.search?.primary ?? []).map((h) => ({ id: h.id, name: h.name, parentName: h.path?.[h.path.length - 1] ?? null, total: h.total, best: true })),
    // One match in a category is a coincidence ("Brooches 1" for water shoes), not a branch to offer.
    ...(j.facets ?? []).filter((f) => f.count > 1).map((f) => ({ id: f.id, name: f.name, parentName: f.parentName ?? null, total: f.count })),
  ]) {
    if (seen.has(c.id) || isCategoryBlocked(c.name) || isCategoryBlocked(c.parentName)) continue;
    seen.add(c.id);
    categories.push(c);
    if (categories.length >= 6) break;
  }
  return { query, products, categories, total: j.pagination?.total ?? products.length, capped: !!j.pagination?.totalCapped, loose: !!j.search?.loose };
}

/** A search worth showing: it names a category, or finds plenty with every word. */
const strong = (f: Found) => !f.loose && (f.categories.some((c) => c.best) || f.total >= 24);

/**
 * One item's products. The model's words first ("cream leather office
 * chair"), and its plain name alongside ("office chair"): measured on
 * catalogue photos, two seen attributes often leave one or two listings,
 * or none in the right category. The first that is worth showing wins;
 * failing that, whichever finds most. The page says which words it used,
 * and the shopper can add the rest back.
 */
async function searchItem(item: DetectedItem, origin: string): Promise<Found> {
  const ladder = [...new Set([item.query, item.label].map((s) => s.trim().toLowerCase()).filter(Boolean))];
  const found = await Promise.all(ladder.map((q) => searchFor(q, origin)));
  return found.find(strong) ?? [...found].filter((f) => !f.loose).sort((a, b) => b.total - a.total)[0] ?? found[0];
}

/** A name that could be one of our image files ("cjqy1553217", "27210742-1"), not a word ("dress"). */
const looksLikeId = (s: string) => s.length >= 6 && /\d/.test(s) && !/\s/.test(s);

const S3_HOST = "affan-product-images.s3.ap-south-1.amazonaws.com";

/**
 * The stored imageUrl behind a link to one of our product pictures, in any
 * of the forms the site serves it (lib/cdn.ts): the bucket itself, the CDN
 * in front of it, the image resizer (the key is in its base64 path), or
 * next/image's ?url=. Null for anyone else's picture.
 */
function ourImageUrl(link: string, depth = 0): string | null {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  if (u.pathname.startsWith("/_next/image") && depth < 2) {
    const inner = u.searchParams.get("url");
    return inner ? ourImageUrl(new URL(inner, u).href, depth + 1) : null;
  }
  if (u.hostname === S3_HOST) return `https://${S3_HOST}${u.pathname}`;
  const origin = (env?: string) => {
    try {
      return env ? new URL(env).origin : null;
    } catch {
      return null;
    }
  };
  if (u.origin === origin(process.env.NEXT_PUBLIC_CDN_URL)) return `https://${S3_HOST}${u.pathname}`;
  if (u.origin === origin(process.env.NEXT_PUBLIC_IMAGE_HANDLER_URL)) {
    try {
      const segment = u.pathname.split("/").filter(Boolean).pop() ?? "";
      const request = JSON.parse(Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { key?: unknown };
      if (typeof request.key === "string") return `https://${S3_HOST}/${request.key}`;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Image search: upload a photograph, get catalogue products of each kind in
 * it.
 *
 * The vision model lists what can be bought in the photo, where each thing
 * is, and the words for it (lib/imageSearch.ts); the catalogue search does
 * the rest. Nothing the model returns reaches SQL unescaped, and no product
 * data is passed to the model, so it cannot invent a product, a price or a
 * lead time: results are real rows or there are none.
 *
 * The response keeps the fields the Android app reads (isProduct,
 * productType, searchQuery, message, products) and adds the items, so the
 * page can draw them and search each one.
 */
export async function POST(request: NextRequest) {
  const rateLimit = await checkImageSearchRateLimit(request);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Too many image searches. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil(((rateLimit.reset || Date.now()) - Date.now()) / 1000).toString() },
      },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }

  const fileCandidate = form.get("image");
  const file = fileCandidate instanceof File ? fileCandidate : null;
  const fileName = (form.get("fileName") as string) || (file?.name ?? "");
  const sourceUrl = (form.get("sourceUrl") as string) || "";
  // "items": the page wants what the photo holds the moment it is known, and
  // asks the catalogue itself (it draws the boxes while the products load).
  // Anything else, the Android app included, gets products in this answer.
  const itemsOnly = form.get("phase") === "items";

  if (!file && !sourceUrl) {
    return NextResponse.json({ error: "No image was attached." }, { status: 400 });
  }

  // A picture of one of our own products (its page's link, its image file,
  // its SKU as the file name): that product, and more of its kind, without
  // waiting on a vision model.
  const candidates: Prisma.ProductWhereInput[] = [];
  if (sourceUrl) {
    const idMatch = sourceUrl.match(/\/products\/(\d+)/i);
    if (idMatch) candidates.push({ id: parseInt(idMatch[1], 10) });
    const own = ourImageUrl(sourceUrl);
    if (own) candidates.push({ imageUrl: own });
    else {
      // Somewhere else's copy of one of our pictures, by its file name: the whole name, between "/" and ".".
      const fileMatch = sourceUrl.match(/\/([^/?#]+)\.(jpe?g|png|webp|avif)/i);
      if (fileMatch && looksLikeId(fileMatch[1])) candidates.push({ imageUrl: { contains: `/${fileMatch[1]}.`, mode: "insensitive" } });
    }
  }
  if (fileName) {
    const stem = fileName.replace(/\.[^.]+$/, "").trim();
    const isGeneric = /^(image|photo|upload|screenshot|camera|webcam|file|blob)(\s*[\d_-]*)*$/i.test(stem);
    if (!isGeneric && stem.length >= 3) {
      // A picture saved from our site keeps its file name: the whole name, between "/" and ".".
      if (looksLikeId(stem)) candidates.push({ imageUrl: { contains: `/${stem}.`, mode: "insensitive" } });
      candidates.push({ sku: { equals: stem, mode: "insensitive" } });
      candidates.push({ cjPid: { equals: stem, mode: "insensitive" } });
      if (/^\d+$/.test(stem)) candidates.push({ id: parseInt(stem, 10) });
    }
  }
  let exact: (Hit & { categoryName: string | null }) | null = null;
  if (candidates.length) {
    try {
      const found = await prisma.product.findFirst({ where: { OR: candidates }, include: { categoryRef: true } });
      if (found && !isNameBlocked(found.name) && !isCategoryBlocked(found.categoryRef?.name ?? null)) {
        exact = { id: found.id, name: found.name, imageUrl: found.imageUrl, category: found.categoryRef?.name ?? found.category, categoryName: found.categoryRef?.name ?? null };
      }
    } catch (err) {
      console.warn("Exact product pre-lookup failed:", err);
    }
  }

  let description: ImageDescription;
  if (exact) {
    // More of its kind: its category's name searches better than its full listing title.
    const query = exact.categoryName || exact.name.split(/\s+/).slice(0, 4).join(" ");
    description = { isProduct: true, productType: query, terms: [query], items: [{ label: query, query, terms: [query], box: null }] };
  } else {
    let imageBuffer: Buffer;
    let mimeType = file?.type || "image/jpeg";
    if (file) {
      const declared = file.type || "";
      const known = ACCEPTED_IMAGE_TYPES.includes(declared as (typeof ACCEPTED_IMAGE_TYPES)[number]);
      const isSvg = declared === "image/svg+xml";
      const unlabelled = declared === "" || declared === "application/octet-stream";
      if (isSvg || (!known && !unlabelled)) {
        return NextResponse.json(
          { error: "That is not an image we can read. Use a JPEG, PNG, WebP, AVIF, HEIC, GIF, TIFF or BMP." },
          { status: 415 },
        );
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: `That image is over ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB. Try a smaller one.` },
          { status: 413 },
        );
      }
      imageBuffer = Buffer.from(await file.arrayBuffer());
    } else {
      try {
        const fetched = await fetchRemoteImage(sourceUrl);
        imageBuffer = fetched.buffer;
        mimeType = fetched.mediaType;
      } catch (error) {
        const message = error instanceof RemoteImageRefused ? error.message : "Could not load an image from that link.";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    try {
      const { base64, mediaType } = await normaliseForProvider(imageBuffer, mimeType);
      description = await describeProductImage(base64, mediaType, AbortSignal.timeout(12_000));
    } catch (error) {
      if (error instanceof ImageDecodeFailed) {
        console.warn("Image search could not decode upload:", mimeType, error.message);
        return NextResponse.json(
          { error: "That image could not be read. It may be damaged — try re-saving or exporting it." },
          { status: 415 },
        );
      }
      if (error instanceof ImageSearchUnavailable) {
        console.error("Image search has no provider key. Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY.");
        return NextResponse.json({ error: "Image search is not configured yet." }, { status: 503 });
      }
      if (error instanceof ImageSearchBusy) {
        console.warn("Image search provider busy:", error.message);
        return NextResponse.json(
          { error: "The image service is busy right now. Give it a few seconds and try again." },
          { status: 503 },
        );
      }
      if (error instanceof Error && error.name === "TimeoutError") {
        // The file's own name, if it says what the thing is, is better than nothing.
        const stem = fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
        if (/[a-z]{3}/i.test(stem) && !/^(image|photo|upload|screenshot|camera|webcam|file|blob|img)\b/i.test(stem)) {
          description = { isProduct: true, productType: stem, terms: [stem], items: [{ label: stem, query: stem, terms: [stem], box: null }] };
        } else {
          return NextResponse.json({ error: "That took too long. Try again in a moment." }, { status: 504 });
        }
      } else {
        console.error("Image search vision step failed:", error);
        return NextResponse.json({ error: "Could not read that image. Try another." }, { status: 502 });
      }
    }
  }

  if (!description.isProduct || !description.items.length) {
    return NextResponse.json({
      isProduct: false,
      productType: "",
      terms: [],
      items: [],
      products: [],
      categories: [],
      message: "We could not spot a product in this photo. Try one with the item clearly in view.",
    });
  }

  const items: DetectedItem[] = description.items;
  if (itemsOnly && !exact) {
    return NextResponse.json({
      isProduct: true,
      productType: description.productType,
      terms: description.terms,
      searchQuery: items[0].query,
      items,
      products: [],
      categories: [],
      deferred: true,
    });
  }
  try {
    const found = await searchItem(items[0], request.url);
    // A picture of one of ours: that product first.
    const products = exact ? [{ id: exact.id, name: exact.name, imageUrl: exact.imageUrl, category: exact.category }, ...found.products.filter((p) => p.id !== exact!.id)].slice(0, SHOWN) : found.products;
    return NextResponse.json({
      isProduct: true,
      productType: description.productType,
      terms: description.terms,
      // What to put in /products/?q= for the full, paginated result set.
      searchQuery: found.query,
      items,
      query: found.query,
      categories: found.categories,
      products,
      total: found.total,
      capped: found.capped,
      loose: found.loose,
      exactId: exact?.id ?? null,
    });
  } catch (error) {
    console.error("Image search catalogue query failed:", error);
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
