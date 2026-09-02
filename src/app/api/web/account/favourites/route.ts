import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMobileSession } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

/** A saved list is a shortlist, not an archive. */
const FAVOURITE_LIMIT = 200;

/**
 * The products this customer has saved.
 *
 * Two shapes, because two callers want different things. The account page
 * wants the products themselves; every product grid on the site only needs to
 * know which hearts are filled, and asking it to download 200 product rows to
 * colour in some icons would be absurd. `?ids=1` answers with just the ids.
 */
export async function GET(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    // Signed out is not an error here — the grids ask on every page, and a 401
    // per page load would be noise reporting a non-problem.
    if (!user) return NextResponse.json({ ids: [], favourites: [] });

    const idsOnly = new URL(request.url).searchParams.get("ids") === "1";

    if (idsOnly) {
      const rows = await prisma.productFavourite.findMany({
        where: { userId: user.id },
        select: { productId: true },
        take: FAVOURITE_LIMIT,
      });
      return NextResponse.json({ ids: rows.map((r) => r.productId) });
    }

    const rows = await prisma.productFavourite.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: FAVOURITE_LIMIT,
      select: {
        createdAt: true,
        product: { select: { id: true, name: true, imageUrl: true, category: true } },
      },
    });

    return NextResponse.json({
      favourites: rows
        .filter((r) => r.product)
        .map((r) => ({
          savedAt: r.createdAt,
          id: r.product.id,
          name: r.product.name,
          imageUrl: r.product.imageUrl,
          category: r.product.category,
        })),
    });
  } catch (error) {
    console.error("Favourites list error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * Save or unsave a product — one endpoint, because the button is one button.
 *
 * Returns the state it ended in rather than "ok", so the heart is drawn from
 * what the server actually holds instead of from what the client assumed when
 * it fired the request.
 */
export async function POST(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) {
      return NextResponse.json({ error: "Sign in to save products." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const productId = Number.parseInt(String(body?.productId ?? ""), 10);
    if (!Number.isInteger(productId)) {
      return NextResponse.json({ error: "A productId is required." }, { status: 400 });
    }

    const where = { userId_productId: { userId: user.id, productId } };
    const existing = await prisma.productFavourite.findUnique({ where });

    if (existing) {
      await prisma.productFavourite.delete({ where });
      return NextResponse.json({ saved: false });
    }

    const count = await prisma.productFavourite.count({ where: { userId: user.id } });
    if (count >= FAVOURITE_LIMIT) {
      return NextResponse.json(
        { error: `You can save up to ${FAVOURITE_LIMIT} products. Remove one to add another.` },
        { status: 409 }
      );
    }

    await prisma.productFavourite.create({ data: { userId: user.id, productId } });
    return NextResponse.json({ saved: true });
  } catch (error) {
    // A product id the nightly re-sync has since removed fails the foreign
    // key. That is a stale page, not a fault worth showing anyone.
    console.error("Favourite toggle error:", error);
    return NextResponse.json({ error: "Could not save that product." }, { status: 400 });
  }
}
