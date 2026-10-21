import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSupplier } from "@/lib/supplier-session";
import { checkSupplierApplyRateLimit, limitReached } from "@/lib/rate-limit";
import { OFFERS_PER_DAY, OPEN_STATUSES, readOffer } from "@/lib/supplier-offer";
import { isSupplierPhotoUrl } from "@/lib/video-storage";
import { isProductHidden } from "@/lib/productVisibility";
import { getCachedAllCategories } from "@/lib/products";

export const dynamic = "force-dynamic";

const NOT_SIGNED_IN = { error: "Your session has ended. Sign in again.", reason: "signed_out" };

/** What a supplier sees of their own application. Not who on the team reviewed it. */
const OFFER_FIELDS = {
  id: true,
  productId: true,
  productName: true,
  productImage: true,
  categoryName: true,
  moq: true,
  moqUnit: true,
  details: true,
  photos: true,
  contactName: true,
  companyName: true,
  mobile: true,
  wechatId: true,
  companyAddress: true,
  status: true,
  reply: true,
  reviewedAt: true,
  createdAt: true,
} as const;

/** The signed-in supplier's applications, newest first. */
export async function GET() {
  const supplier = await readSupplier();
  if (!supplier) return NextResponse.json(NOT_SIGNED_IN, { status: 401 });
  const offers = await prisma.supplierOffer.findMany({
    where: { supplierId: supplier.id },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: OFFER_FIELDS,
  });
  return NextResponse.json({ offers }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Send an application: "I have this product", with the MOQ, the product's details, the contact details and up
 * to five photos (the owner, 2026-10-21). For a catalogue product, its name, picture and category are copied
 * from the catalogue here, never taken from the request; for one the supplier names themselves, the name they
 * typed.
 *
 * The contact details are where the company, the WeChat ID and the address are first asked (an account is made
 * with a name, an email, a mobile and a password only). Whatever an application is sent with is kept on the
 * account as well, so the next one opens filled in; the application keeps its own copy either way.
 *
 * One open application per catalogue product per supplier: a second while the first is open would be the same
 * offer twice, so the supplier is pointed at the one they have.
 */
export async function POST(request: Request) {
  const supplier = await readSupplier();
  if (!supplier) return NextResponse.json(NOT_SIGNED_IN, { status: 401 });

  const limit = await checkSupplierApplyRateLimit(supplier.id);
  if (!limit.success) return limitReached("You have sent a lot of applications in the last hour.", limit);

  try {
    const body = await request.json().catch(() => ({}));
    const input = readOffer(body && typeof body === "object" ? body : {}, isSupplierPhotoUrl);
    if (!input.ok) return NextResponse.json({ error: input.error, field: input.field }, { status: 400 });
    const offer = input.value;

    // The daily cap, in the database, so it holds whether or not Upstash answers.
    const today = await prisma.supplierOffer.count({
      where: { supplierId: supplier.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    if (today >= OFFERS_PER_DAY) {
      return NextResponse.json(
        { error: `You have sent ${OFFERS_PER_DAY} applications in the last day, the most one account can. Please send the rest tomorrow.`, reason: "rate_limited" },
        { status: 429 },
      );
    }

    let product: { id: number; name: string; imageUrl: string | null; categoryName: string | null } | null = null;
    if (offer.productId !== null) {
      const row = await prisma.product.findUnique({
        where: { id: offer.productId },
        select: { id: true, name: true, imageUrl: true, categoryId: true },
      });
      if (!row || (await isProductHidden(row))) {
        return NextResponse.json({ error: "That product is no longer in our catalogue.", field: "productId" }, { status: 404 });
      }
      const open = await prisma.supplierOffer.findFirst({
        where: { supplierId: supplier.id, productId: row.id, status: { in: [...OPEN_STATUSES] } },
        select: { id: true },
      });
      if (open) {
        return NextResponse.json(
          { error: "You have already applied for this product. You'll find it in My applications.", reason: "duplicate", offerId: open.id },
          { status: 409 },
        );
      }
      const categories = await getCachedAllCategories();
      product = {
        id: row.id,
        name: row.name,
        imageUrl: row.imageUrl,
        categoryName: row.categoryId ? categories.find((c) => c.id === row.categoryId)?.name ?? null : null,
      };
    }

    const [created] = await prisma.$transaction([
      prisma.supplierOffer.create({
        data: {
          supplierId: supplier.id,
          productId: product?.id ?? null,
          productName: product?.name ?? (offer.productName as string),
          productImage: product?.imageUrl ?? null,
          categoryName: product?.categoryName ?? null,
          moq: offer.moq,
          moqUnit: offer.moqUnit,
          details: offer.details,
          photos: offer.photos,
          contactName: offer.contact.name,
          companyName: offer.contact.companyName,
          mobile: offer.contact.mobile,
          wechatId: offer.contact.wechatId,
          companyAddress: offer.contact.companyAddress,
        },
        select: OFFER_FIELDS,
      }),
      prisma.supplierAccount.update({
        where: { id: supplier.id },
        data: {
          name: offer.contact.name,
          mobile: offer.contact.mobile,
          companyName: offer.contact.companyName,
          wechatId: offer.contact.wechatId,
          companyAddress: offer.contact.companyAddress,
        },
        select: { id: true },
      }),
    ]);
    return NextResponse.json({ offer: created }, { status: 201 });
  } catch (error) {
    console.error("Supplier application error:", error instanceof Error ? `${error.name}: ${error.message.split("\n")[0]}` : "unknown");
    return NextResponse.json({ error: "Your application did not send. Try again." }, { status: 500 });
  }
}
