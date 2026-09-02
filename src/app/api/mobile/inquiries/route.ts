import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { describeStatus, parseMOQ } from "@/lib/mobile-inquiry";

export const dynamic = "force-dynamic";

// The customer's own inquiries, newest first.
export async function GET(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const inquiries = await prisma.mobileInquiry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        productId: true,
        productName: true,
        productImage: true,
        requestedMOQ: true,
        status: true,
        statusNote: true,
        moqEditedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      inquiries: inquiries.map((i) => ({
        ...i,
        // Resolved server-side so every client shows the same wording.
        ...describeStatus(i.status, i.statusNote),
      })),
    });
  } catch (error) {
    console.error("Mobile Inquiries List Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

// Raise an inquiry against a catalogue product.
export async function POST(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const productId = Number.parseInt(String(body?.productId ?? ""), 10);
    const requestedMOQ = parseMOQ(body?.requestedMOQ);

    if (!Number.isInteger(productId)) {
      return NextResponse.json({ error: "A productId is required." }, { status: 400 });
    }
    if (requestedMOQ === null) {
      return NextResponse.json({ error: "Enter a quantity of at least 1." }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, imageUrl: true },
    });
    if (!product) {
      return NextResponse.json({ error: "That product no longer exists." }, { status: 404 });
    }

    // Name and image are copied, not just referenced: the catalogue is re-synced
    // from CJ daily and products do disappear, but the customer's own inquiry
    // list still has to render months later.
    const inquiry = await prisma.mobileInquiry.create({
      data: {
        userId: user.id,
        productId: product.id,
        productName: product.name,
        productImage: product.imageUrl,
        requestedMOQ,
      },
      select: {
        id: true,
        productId: true,
        productName: true,
        productImage: true,
        requestedMOQ: true,
        status: true,
        statusNote: true,
        moqEditedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      { inquiry: { ...inquiry, ...describeStatus(inquiry.status, inquiry.statusNote) } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Mobile Inquiry Create Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
