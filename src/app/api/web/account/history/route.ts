import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMobileSession } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

/** How much of a customer's own history is worth showing at once. */
const HISTORY_LIMIT = 60;

/**
 * The products this customer has opened, newest first.
 *
 * Only ever their own: the rows are selected by the id the session cookie
 * resolves to, never by anything the caller can name. There is no route here
 * that reads somebody else's history, because there is no reason for one.
 *
 * Note this is not analytics. One row per person per product, moved forward
 * when they look again — so it answers "what was I looking at", not "how many
 * times did they open it". CLAUDE.md is explicit that the site does no user
 * tracking; this exists because the customer asked to see their own trail, and
 * it holds nothing they could not reconstruct from their own browser history.
 */
export async function GET(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const rows = await prisma.productView.findMany({
      where: { userId: user.id },
      orderBy: { viewedAt: "desc" },
      take: HISTORY_LIMIT,
      select: {
        viewedAt: true,
        product: {
          select: { id: true, name: true, imageUrl: true, category: true },
        },
      },
    });

    return NextResponse.json({
      // A product deleted by the nightly CJ re-sync takes its rows with it
      // (onDelete: Cascade), so `product` should always be present — the guard
      // is here so a half-applied migration cannot 500 the page.
      history: rows
        .filter((r) => r.product)
        .map((r) => ({
          viewedAt: r.viewedAt,
          id: r.product.id,
          name: r.product.name,
          imageUrl: r.product.imageUrl,
          category: r.product.category,
        })),
    });
  } catch (error) {
    console.error("Account history list error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * Record that this customer opened a product.
 *
 * Silently does nothing when nobody is signed in — the product page fires this
 * on every view, and a signed-out visitor getting a 401 in their console on
 * every page would be noise reporting a non-problem.
 */
export async function POST(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ recorded: false });

    const body = await request.json().catch(() => ({}));
    const productId = Number.parseInt(String(body?.productId ?? ""), 10);
    if (!Number.isInteger(productId)) {
      return NextResponse.json({ error: "A productId is required." }, { status: 400 });
    }

    // Upsert against the [userId, productId] unique index: looking at the same
    // product twice moves it to the top of the list rather than filling the
    // history with repeats of one item.
    await prisma.productView.upsert({
      where: { userId_productId: { userId: user.id, productId } },
      create: { userId: user.id, productId },
      update: { viewedAt: new Date() },
    });

    return NextResponse.json({ recorded: true });
  } catch (error) {
    // A product id that no longer exists fails the foreign key. That is a
    // stale page, not a fault worth showing anyone.
    console.error("Account history record error:", error);
    return NextResponse.json({ recorded: false });
  }
}

/** Clear the whole trail. Theirs to keep, so theirs to delete. */
export async function DELETE(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { count } = await prisma.productView.deleteMany({ where: { userId: user.id } });
    return NextResponse.json({ cleared: count });
  } catch (error) {
    console.error("Account history clear error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
