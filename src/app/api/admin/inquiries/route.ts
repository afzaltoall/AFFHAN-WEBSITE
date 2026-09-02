import { NextResponse } from "next/server";
import { Prisma } from ".prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { describeStatus, isMobileInquiryStatus } from "@/lib/mobile-inquiry";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

// Inquiries raised in the app, newest first, optionally narrowed to one status.
export async function GET(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));

    const where: Prisma.MobileInquiryWhereInput = isMobileInquiryStatus(status) ? { status } : {};

    const [total, rows] = await Promise.all([
      prisma.mobileInquiry.count({ where }),
      prisma.mobileInquiry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
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
          // No passwordHash or googleId — same rule as the app-users listing.
          user: { select: { id: true, name: true, email: true } },
          // Enough to flag "the customer changed this" in the list; the full
          // trail is on the detail route.
          _count: { select: { moqHistory: true } },
          moqHistory: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { oldMOQ: true, newMOQ: true, createdAt: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      inquiries: rows.map(({ _count, moqHistory, ...i }) => ({
        ...i,
        ...describeStatus(i.status, i.statusNote),
        moqEditCount: _count.moqHistory,
        lastMoqEdit: moqHistory[0] ?? null,
      })),
      pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("Admin Mobile Inquiries Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
