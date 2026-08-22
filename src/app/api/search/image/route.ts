import { NextRequest, NextResponse } from "next/server";
import { Prisma } from ".prisma/client";
import { prisma } from "@/lib/prisma";
import { parseQuery, buildSearchWhere, buildRelevanceExpr } from "@/lib/search";
import { isCategoryBlocked, isNameBlocked } from "@/lib/moderation";
import {
  describeProductImage,
  ImageSearchUnavailable,
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from "@/lib/imageSearch";

export const dynamic = "force-dynamic";
/** Vision call plus a catalogue query. Comfortably inside the Hobby limit, but
 *  worth stating rather than inheriting the default. */
export const maxDuration = 30;

type ProductRow = {
  id: number;
  name: string;
  imageUrl: string | null;
  category: string | null;
  categoryName: string | null;
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
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    return NextResponse.json(
      { error: "Upload a JPEG, PNG, WebP or GIF." },
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
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    description = await describeProductImage(base64, file.type, AbortSignal.timeout(20_000));
  } catch (error) {
    if (error instanceof ImageSearchUnavailable) {
      // Deliberately explicit: this is a missing environment variable, not a
      // bug, and saying so saves someone debugging the wrong thing.
      console.error("Image search called without ANTHROPIC_API_KEY set.");
      return NextResponse.json(
        { error: "Image search is not configured yet." },
        { status: 503 },
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

  // Most distinctive terms first; the catalogue search is happier with a short
  // phrase than with six loosely related nouns.
  const query = description.terms.slice(0, 4).join(" ");
  const pq = parseQuery(query);
  if (!pq.isValid) {
    return NextResponse.json({
      isProduct: true,
      productType: description.productType,
      terms: description.terms,
      products: [],
    });
  }

  try {
    const where = buildSearchWhere(pq, { prefix: true });
    const relevance = buildRelevanceExpr(pq, { prefix: true });

    const rows = await prisma.$queryRaw<ProductRow[]>(Prisma.sql`
      SELECT p."id", p."name", p."imageUrl", p."category", c."name" AS "categoryName"
      FROM "Product" p
      LEFT JOIN "Category" c ON p."categoryId" = c."id"
      WHERE ${where}
      ORDER BY ${relevance} DESC, p."id" DESC
      LIMIT 40
    `);

    // Same moderation gate the text search applies. An uploaded photo is not a
    // reason to surface something the typed search would hide.
    const products = rows
      .filter((p) => !isCategoryBlocked(p.categoryName) && !isNameBlocked(p.name))
      .slice(0, 24)
      .map((p) => ({
        id: p.id,
        name: p.name,
        imageUrl: p.imageUrl,
        category: p.categoryName || p.category,
      }));

    return NextResponse.json({
      isProduct: true,
      productType: description.productType,
      terms: description.terms,
      products,
    });
  } catch (error) {
    console.error("Image search catalogue query failed:", error);
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
