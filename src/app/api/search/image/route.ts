import { NextRequest, NextResponse } from "next/server";
import { Prisma } from ".prisma/client";
import { prisma } from "@/lib/prisma";
import { parseQuery, buildSearchWhere, buildRelevanceExpr } from "@/lib/search";
import { isCategoryBlocked, isNameBlocked } from "@/lib/moderation";
import {
  describeProductImage,
  normaliseForProvider,
  ImageSearchUnavailable,
  ImageSearchBusy,
  ImageDecodeFailed,
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from "@/lib/imageSearch";import { checkImageSearchRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
/** Vision call plus a catalogue query. Comfortably inside the Hobby limit, but
 *  worth stating rather than inheriting the default. */
export const maxDuration = 30;

type ProductRow = {
  id: number;
  name: string;
  imageUrl: string | null;
  category: string | null;
  categoryId: string | null;
  categoryName: string | null;
  parentName: string | null;
};

/**
 * Image search: upload a photograph, get catalogue products of that kind.
 *
 * The vision model only produces search terms — the actual lookup runs through
 * the same parseQuery/buildSearchWhere path as the text search, against the
 * existing pg_trgm indexes. Nothing the model returns reaches SQL unescaped,
 * and no product data is ever passed to the model, so it cannot invent a
 * product, a price or a lead time. Results are real rows or there are none.
 */
export async function POST(request: NextRequest) {
  // Check rate limit first
  const rateLimit = await checkImageSearchRateLimit(request);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Too many image searches. Please try again later." },
      { 
        status: 429, 
        headers: { "Retry-After": Math.ceil(((rateLimit.reset || Date.now()) - Date.now()) / 1000).toString() }
      }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image was attached." }, { status: 400 });
  }
  // The declared MIME type is a hint, not proof. File pickers on iOS and
  // Windows routinely hand back "" or application/octet-stream for AVIF and
  // HEIC, so rejecting on it alone turns away perfectly valid phone photos —
  // measured: a real AVIF posted without an explicit type was refused here
  // while the identical bytes with type=image/avif went through the whole
  // pipeline. Anything unrecognised is passed to the decoder and judged on its
  // actual content; only files that positively declare themselves something
  // else are refused up front.
  const declared = file.type || "";
  const known = ACCEPTED_IMAGE_TYPES.includes(declared as (typeof ACCEPTED_IMAGE_TYPES)[number]);
  // SVG is markup, not a photograph. Rasterising untrusted markup is an attack
  // surface this feature has no reason to accept.
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

  let description;
  try {
    // Transcode first when needed. The upload filter accepts AVIF, HEIC, GIF,
    // TIFF and BMP, none of which a vision provider will take directly — this
    // turns them into JPEG (and corrects EXIF rotation) before the call.
    const raw = Buffer.from(await file.arrayBuffer());
    const { base64, mediaType } = await normaliseForProvider(raw, file.type);
    description = await describeProductImage(base64, mediaType, AbortSignal.timeout(20_000));
  } catch (error) {
    if (error instanceof ImageDecodeFailed) {
      console.warn("Image search could not decode upload:", file.type, error.message);
      return NextResponse.json(
        { error: "That image could not be read. It may be damaged — try re-saving or exporting it." },
        { status: 415 },
      );
    }
    if (error instanceof ImageSearchUnavailable) {
      // Deliberately explicit: this is a missing environment variable, not a
      // bug, and saying so saves someone debugging the wrong thing.
      console.error("Image search has no provider key. Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY.");
      return NextResponse.json(
        { error: "Image search is not configured yet." },
        { status: 503 },
      );
    }
    if (error instanceof ImageSearchBusy) {
      // Not the user's fault and not the image's. Saying "try another image"
      // here sends people off to crop and re-upload a perfectly good photo.
      console.warn("Image search provider busy:", error.message);
      return NextResponse.json(
        { error: "The image service is busy right now. Give it a few seconds and try again." },
        { status: 503 },
      );
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "That took too long. Try again in a moment." },
        { status: 504 },
      );
    }
    console.error("Image search vision step failed:", error);
    return NextResponse.json({ error: "Could not read that image. Try another." }, { status: 502 });
  }

  if (!description.isProduct) {
    return NextResponse.json({
      isProduct: false,
      productType: "",
      terms: [],
      products: [],
      message: "That does not look like a product. Try a clear photo of the item itself.",
    });
  }

  // One query per term, ORed — not all the terms concatenated into one.
  //
  // tsQueryString joins tokens with & , so passing "ski goggles snowboard
  // goggles winter sports eyewear" as a single phrase demands a product name
  // containing every one of those words. Measured against the live catalogue
  // that matches 0 products, while the same terms ORed match 55. The earlier
  // build returned a single result only because the degenerate-query ILIKE
  // fallback caught it.
  //
  // productType goes in first: it is usually the cleanest single phrase the
  // model produces ("ski goggles"), and summing the per-term relevance means a
  // product matching several terms still outranks one matching only a loose
  // synonym.
  const phrases = [description.productType, ...description.terms]
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5);

  const parsed = phrases.map((t) => parseQuery(t)).filter((pq) => pq.isValid);
  if (parsed.length === 0) {
    return NextResponse.json({
      isProduct: true,
      productType: description.productType,
      terms: description.terms,
      products: [],
    });
  }

  try {
    const where = Prisma.sql`(${Prisma.join(
      parsed.map((pq) => buildSearchWhere(pq)),
      " OR ",
    )})`;
    const relevance = Prisma.sql`(${Prisma.join(
      parsed.map((pq) => buildRelevanceExpr(pq)),
      " + ",
    )})`;

    const rows = await prisma.$queryRaw<ProductRow[]>(Prisma.sql`
      SELECT p."id", p."name", p."imageUrl", p."category", p."categoryId",
             c."name" AS "categoryName", c."parentName" AS "parentName"
      FROM "Product" p
      LEFT JOIN "Category" c ON p."categoryId" = c."id"
      WHERE ${where}
      ORDER BY ${relevance} DESC, p."id" DESC
      LIMIT 60
    `);

    // Same moderation gate the text search applies. An uploaded photo is not a
    // reason to surface something the typed search would hide.
    const products = rows
      .filter((p) => !isCategoryBlocked(p.categoryName) && !isNameBlocked(p.name))
      // 48 is a quick-look, not the whole result set. Anyone wanting the rest
      // is sent to /products/?q= , which paginates properly and does not hold
      // sixty product images in a modal.
      .slice(0, 48)
      .map((p) => ({
        id: p.id,
        name: p.name,
        imageUrl: p.imageUrl,
        category: p.categoryName || p.category,
      }));

    // Categories are derived from the products that actually matched, not from
    // a second query against Category by name. Category names are short leaves
    // like "Quartz Watches", so matching them against a phrase the model
    // produced ("analog wristwatch") returns nothing — measured, 0 rows. The
    // branches the matches already sit in are both more accurate and free.
    const byCategory = new Map<string, { id: string; name: string; parentName: string | null; count: number }>();
    for (const r of rows) {
      if (!r.categoryId || !r.categoryName) continue;
      if (isCategoryBlocked(r.categoryName) || isCategoryBlocked(r.parentName)) continue;
      const hit = byCategory.get(r.categoryId);
      if (hit) hit.count += 1;
      else byCategory.set(r.categoryId, { id: r.categoryId, name: r.categoryName, parentName: r.parentName, count: 1 });
    }
    // A single match is usually coincidence rather than a real branch — a
    // wristwatch search otherwise surfaces "Decorative Flowers & Wreaths" off
    // one stray listing. Two is enough to mean something. If nothing clears
    // that bar the top few are still better than an empty row.
    const ranked = [...byCategory.values()].sort((a, b) => b.count - a.count);
    const solid = ranked.filter((c) => c.count > 1);
    const categories = (solid.length >= 2 ? solid : ranked).slice(0, 6);

    return NextResponse.json({
      isProduct: true,
      productType: description.productType,
      terms: description.terms,
      // What to put in /products/?q= for the full, paginated result set.
      searchQuery: description.productType || description.terms[0] || "",
      categories,
      products,
    });
  } catch (error) {
    console.error("Image search catalogue query failed:", error);
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
