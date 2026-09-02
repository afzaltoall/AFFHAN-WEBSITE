import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { describeStatus, parseMOQ } from "@/lib/mobile-inquiry";

export const dynamic = "force-dynamic";

const DETAIL_SELECT = {
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
  moqHistory: {
    orderBy: { createdAt: "desc" },
  },
} as const;

// One inquiry, for the detail screen.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { id } = await params;
    // Scoped to the caller, so a guessed id reads as "not found" rather than
    // confirming that someone else's inquiry exists.
    const inquiry = await prisma.mobileInquiry.findFirst({
      where: { id, userId: user.id },
      select: DETAIL_SELECT,
    });
    if (!inquiry) return NextResponse.json({ error: "Not found." }, { status: 404 });

    return NextResponse.json({
      inquiry: { ...inquiry, ...describeStatus(inquiry.status, inquiry.statusNote) },
    });
  } catch (error) {
    console.error("Mobile Inquiry Get Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

// Change the requested quantity. This is the only field the customer owns —
// status is the sourcing team's, and is not accepted here whatever the body says.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const requestedMOQ = parseMOQ(body?.requestedMOQ);
    if (requestedMOQ === null) {
      return NextResponse.json({ error: "Enter a quantity of at least 1." }, { status: 400 });
    }

    const existing = await prisma.mobileInquiry.findFirst({
      where: { id, userId: user.id },
      select: { id: true, requestedMOQ: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

    // Re-saving the same number is not an edit; recording it would pad the
    // admin's history with rows that say nothing changed.
    if (existing.requestedMOQ === requestedMOQ) {
      const unchanged = await prisma.mobileInquiry.findUniqueOrThrow({
        where: { id: existing.id },
        select: DETAIL_SELECT,
      });
      return NextResponse.json({
        inquiry: { ...unchanged, ...describeStatus(unchanged.status, unchanged.statusNote) },
        changed: false,
      });
    }

    // The inquiry and its trail move together — an admin looking at a changed
    // quantity must always find the row saying where it came from.
    const [, updated] = await prisma.$transaction([
      prisma.mobileInquiryMoqHistory.create({
        data: { 
          inquiryId: existing.id, 
          oldMOQ: existing.requestedMOQ, 
          newMOQ: requestedMOQ,
          changedByUserId: user.id
        },
      }),
      prisma.mobileInquiry.update({
        where: { id: existing.id },
        data: { requestedMOQ, moqEditedAt: new Date() },
        select: DETAIL_SELECT,
      }),
    ]);

    return NextResponse.json({
      inquiry: { ...updated, ...describeStatus(updated.status, updated.statusNote) },
      changed: true,
    });
  } catch (error) {
    console.error("Mobile Inquiry Update Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
