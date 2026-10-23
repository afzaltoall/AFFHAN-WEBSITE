import { NextResponse } from "next/server";
import { Prisma } from ".prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { describeStatus, isMobileInquiryStatus } from "@/lib/inquiry-status";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

/**
 * The AFFHAN app's quote requests, newest first, for App inquiries (inside App users), optionally narrowed to one
 * customer-facing stage. They are ordinary inquiries sent from the app (Inquiry.source APP, 2026-10-23), so the open
 * pool, Lead / No lead, matching suppliers and the handling history treat them exactly as the website's; each opens in
 * the console's own popup. Not the old MobileInquiry table, which no app writes (it has no rows on production).
 */
export async function GET(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const stage = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));

    const where: Prisma.InquiryWhereInput = {
      source: "APP",
      status: { not: "deleted" },
      ...(isMobileInquiryStatus(stage) ? { customerStatus: stage } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.inquiry.count({ where }),
      prisma.inquiry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          productId: true,
          productName: true,
          quantity: true,
          customerName: true,
          email: true,
          phone: true,
          country: true,
          status: true,
          customerStatus: true,
          statusNote: true,
          createdAt: true,
          product: { select: { imageUrl: true } },
        },
      }),
    ]);

    return NextResponse.json({
      inquiries: rows.map(({ product, status, customerStatus, statusNote, ...i }) => {
        const told = describeStatus(customerStatus, statusNote);
        return { ...i, productImage: product?.imageUrl ?? null, triage: status, stage: told.status, label: told.label };
      }),
      pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("Admin App Inquiries Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
