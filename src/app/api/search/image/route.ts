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

  const fileCandidate = form.get("image");
  const file = fileCandidate instanceof File ? fileCandidate : null;
  const fileName = (form.get("fileName") as string) || (file?.name ?? "");
  const sourceUrl = (form.get("sourceUrl") as string) || "";

  if (!file && !sourceUrl) {
    return NextResponse.json({ error: "No image was attached." }, { status: 400 });
  }

  // Direct exact match: if the user uploaded an image from our website (matching filename, SKU, PID or URL)
  let exactProduct: ProductRow | null = null;
  const candidatesToCheck: Prisma.ProductWhereInput[] = [];

  if (sourceUrl) {
    const idMatch = sourceUrl.match(/\/products\/(\d+)/i);
    if (idMatch) candidatesToCheck.push({ id: parseInt(idMatch[1], 10) });
    const s3Match = sourceUrl.match(/\/([^/?#]+)\.(jpe?g|png|webp|avif)/i);
    if (s3Match) candidatesToCheck.push({ imageUrl: { contains: s3Match[1], mode: "insensitive" } });
  }

  if (fileName) {
    const stem = fileName.replace(/\.[^.]+$/, "").trim();
    const isGeneric = /^(image|photo|upload|screenshot|camera|file|blob)(\s*[\d_-]*)*$/i.test(stem);
    if (!isGeneric && stem.length >= 3) {
      candidatesToCheck.push({ imageUrl: { contains: stem, mode: "insensitive" } });
      candidatesToCheck.push({ sku: { equals: stem, mode: "insensitive" } });
      candidatesToCheck.push({ cjPid: { equals: stem, mode: "insensitive" } });
      if (/^\d+$/.test(stem)) {
        candidatesToCheck.push({ id: parseInt(stem, 10) });
      }
    }
  }

  if (candidatesToCheck.length > 0) {
    try {
      const found = await prisma.product.findFirst({
        where: { OR: candidatesToCheck },
        include: { categoryRef: true },
      });
      if (found) {
        exactProduct = {
          id: found.id,
          name: found.name,
          imageUrl: found.imageUrl,
          category: found.category,
          categoryId: found.categoryId,
          categoryName: found.categoryRef?.name || found.category,
          parentName: found.categoryRef?.parentName || null,
        };
      }
    } catch (err) {
      console.warn("Exact product pre-lookup failed:", err);
    }
  }

  // If exact product was matched directly from our database (by SKU, image slug, URL or ID),
  // we do NOT need to wait for a slow vision model! We already know the exact product.
  let description: { isProduct: boolean; productType: string; terms: string[] };

  if (exactProduct) {
    const pq = parseQuery(exactProduct.name);
    const catName = exactProduct.categoryName || exactProduct.category || "";
    description = {
      isProduct: true,
      productType: exactProduct.name,
      terms: [
        exactProduct.name,
        pq.tokens.slice(0, 3).join(" "),
        catName,
      ].filter(Boolean),
    };
  } else {
    // If no file but sourceUrl was given and didn't match DB, fetch it
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
        const fetchRes = await fetch(sourceUrl, { signal: AbortSignal.timeout(6_000) });
        if (!fetchRes.ok) {
          return NextResponse.json({ error: "Could not load image from the provided URL." }, { status: 400 });
        }
        imageBuffer = Buffer.from(await fetchRes.arrayBuffer());
        const ctype = fetchRes.headers.get("content-type");
        if (ctype) mimeType = ctype;
      } catch {
        return NextResponse.json({ error: "Could not load image from that URL." }, { status: 400 });
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
        return NextResponse.json(
          { error: "Image search is not configured yet." },
          { status: 503 },
        );
      }
      if (error instanceof ImageSearchBusy) {
        console.warn("Image search provider busy:", error.message);
        return NextResponse.json(
          { error: "The image service is busy right now. Give it a few seconds and try again." },
          { status: 503 },
        );
      }
      if (error instanceof Error && error.name === "TimeoutError") {
        // Fallback: If filename has meaningful words, try searching them instead of failing!
        const stem = fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
        const stemQuery = parseQuery(stem);
        if (stemQuery.tokens.length >= 1 && !/^(image|photo|upload|screenshot|file|blob)$/i.test(stem)) {
          description = {
            isProduct: true,
            productType: stem,
            terms: [stem, ...stemQuery.tokens],
          };
        } else {
          return NextResponse.json(
            { error: "That took too long. Try again in a moment." },
            { status: 504 },
          );
        }
      } else {
        console.error("Image search vision step failed:", error);
        return NextResponse.json({ error: "Could not read that image. Try another." }, { status: 502 });
      }
    }
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

  // Decompose productType: extract the core noun phrase (stripping speculative AI noise words like faux, pu, vintage)
  const ptQuery = parseQuery(description.productType);
  const NOISE_ADJECTIVES = new Set([
    "faux", "pu", "synthetic", "genuine", "real", "vintage", "retro", "casual",
    "slim", "fashion", "solid", "printed", "striped", "color", "plain", "classic"
  ]);
  const coreTokens = ptQuery.tokens.filter((t) => !NOISE_ADJECTIVES.has(t.toLowerCase()));
  const corePhrase = coreTokens.length >= 2 ? coreTokens.join(" ") : description.productType;

  const allPhrases = [
    description.productType,
    corePhrase,
    ...description.terms
  ].filter(Boolean);

  const uniquePhrases = [...new Set(allPhrases.map((t) => t.trim()))].slice(0, 6);
  const parsed = uniquePhrases.map((t) => parseQuery(t)).filter((pq) => pq.isValid);
  if (parsed.length === 0) {
    return NextResponse.json({
      isProduct: true,
      productType: description.productType,
      terms: description.terms,
      products: exactProduct ? [exactProduct] : [],
    });
  }

  try {
    const corePq = corePhrase ? parseQuery(corePhrase) : null;
    const coreTsq = corePq && corePq.tsTokens.length > 0 ? corePq.tsTokens.join(" & ") : null;
    const coreRelevance = coreTsq
      ? Prisma.sql`(CASE WHEN to_tsvector('english', p."name") @@ to_tsquery('english', ${coreTsq}) THEN 2000 ELSE 0 END)`
      : Prisma.sql`0`;

    // Exact contiguous phrase match boost (e.g. 'Tactical Helmet' inside 'Lightweight Tactical Helmet')
    const phrasePattern = `%${corePhrase}%`;
    const phraseBonus = Prisma.sql`(CASE WHEN p."name" ILIKE ${phrasePattern} THEN 1200 ELSE 0 END)`;

    // Head noun bonus: prioritize products that ARE the target item (end with the noun)
    const phraseWords = corePhrase.toLowerCase().split(/\s+/).filter(Boolean);
    const headNoun = phraseWords[phraseWords.length - 1] || "";
    const headNounBonus = headNoun
      ? Prisma.sql`(CASE WHEN p."name" ILIKE ${`%${corePhrase}`} THEN 2000
                         WHEN p."name" ILIKE ${`%${headNoun}`} THEN 1500
                         ELSE 0 END)`
      : Prisma.sql`0`;

    // Deprioritize accessory parts (lamps, mounts, brackets, bags) when searching for the main object
    const accessoryPenalty = headNoun
      ? Prisma.sql`(CASE WHEN (p."name" ILIKE '%accessories%' OR p."name" ILIKE '%accessory%' OR p."name" ILIKE '%lamp%' OR p."name" ILIKE '%bracket%' OR p."name" ILIKE '%mount%' OR p."name" ILIKE '%cover%' OR p."name" ILIKE '%bag%') AND NOT (${corePhrase} ILIKE '%accessori%' OR ${corePhrase} ILIKE '%lamp%' OR ${corePhrase} ILIKE '%bag%') THEN -700 ELSE 0 END)`
      : Prisma.sql`0`;

    // Trigram similarity boost to favor concise, directly matching names
    const trigramBonus = Prisma.sql`(similarity(p."name", ${description.productType}) * 600)`;

    // Category alignment boost
    const catBonus = coreTokens.length > 0
      ? Prisma.sql`(CASE WHEN ${Prisma.join(coreTokens.map((t) => Prisma.sql`c."name" ILIKE ${`%${t}%`}`), " OR ")} THEN 250 ELSE 0 END)`
      : Prisma.sql`0`;

    const where = Prisma.sql`(${Prisma.join(
      parsed.map((pq) => buildSearchWhere(pq)),
      " OR ",
    )})`;

    const relevance = Prisma.sql`(${Prisma.join(
      parsed.map((pq) => buildRelevanceExpr(pq)),
      " + ",
    )} + ${coreRelevance} + ${phraseBonus} + ${headNounBonus} + ${accessoryPenalty} + ${trigramBonus} + ${catBonus})`;

    let rows = await prisma.$queryRaw<ProductRow[]>(Prisma.sql`
      SELECT p."id", p."name", p."imageUrl", p."category", p."categoryId",
             c."name" AS "categoryName", c."parentName" AS "parentName"
      FROM "Product" p
      LEFT JOIN "Category" c ON p."categoryId" = c."id"
      WHERE ${where}
      ORDER BY ${relevance} DESC, similarity(p."name", ${description.productType}) DESC, p."id" DESC
      LIMIT 80
    `);

    // If an exact website product was matched, place it at the very top (Rank #1)!
    if (exactProduct) {
      rows = rows.filter((r) => r.id !== exactProduct!.id);
      rows.unshift(exactProduct);
    }

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
