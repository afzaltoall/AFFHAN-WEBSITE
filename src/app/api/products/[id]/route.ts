import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isProductHidden } from "@/lib/productVisibility";

export const dynamic = "force-dynamic";

/**
 * One product as JSON. Public, and consumed by the mobile app rather than by
 * anything in this codebase.
 *
 * Two things were wrong with it and both are fixed here.
 *
 * It applied no moderation at all, so every product /api/products hides was
 * still served in full through this route — the same hole the product detail
 * page had. A moderated product is a 404 here for the same reason it is a 404
 * there.
 *
 * And it returned the whole row with `findUnique`, which includes `sku`. Every
 * SKU in this catalogue is the supplier's own code: publishing one identifies
 * the supplier and lets anyone look the item up at its source price. The PDP
 * refuses to render it for exactly that reason and builds an "AFF-<id>"
 * reference instead, so this route now selects its fields explicitly and does
 * the same. `select` rather than `omit` deliberately — a column added to the
 * schema later must not appear in a public payload by default.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const productId = parseInt(id, 10);
    if (isNaN(productId)) {
      return new NextResponse("Invalid ID", { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        allImages: true,
        description: true,
        categoryId: true,
        category: true,
        weightGrams: true,
        lastSynced: true,
      },
    });

    if (!product) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Same 404 a blocked product gets on the website: hiding it from the
    // catalogue while answering for it by id is not hiding it.
    if (await isProductHidden(product)) {
      return new NextResponse("Not Found", { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { ...product, reference: `AFF-${product.id}` },
    });
  } catch (error: unknown) {
    console.error("Failed to fetch product:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
