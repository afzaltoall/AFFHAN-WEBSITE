import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { describeStatus } from "@/lib/mobile-inquiry";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

// One inquiry with its whole quantity-change trail, for the detail panel.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const inquiry = await prisma.mobileInquiry.findUnique({
      where: { id },
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
        user: {
          select: { id: true, name: true, email: true, authProvider: true, createdAt: true },
        },
        // Oldest first: read top to bottom, this is the story of the quantity.
        moqHistory: {
          orderBy: { createdAt: "asc" },
          select: { id: true, oldMOQ: true, newMOQ: true, changedByUserId: true, createdAt: true },
        },
      },
    });
    if (!inquiry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      inquiry: {
        ...inquiry,
        ...describeStatus(inquiry.status, inquiry.statusNote),
        // The number the customer first asked for, before any edit. Without it
        // the trail starts mid-sentence.
        originalMOQ: inquiry.moqHistory[0]?.oldMOQ ?? inquiry.requestedMOQ,
      },
    });
  } catch (error) {
    console.error("Admin Mobile Inquiry Detail Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
