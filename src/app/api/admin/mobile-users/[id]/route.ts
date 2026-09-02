import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { describeStatus } from "@/lib/mobile-inquiry";

export const dynamic = "force-dynamic";

/**
 * Everything the office can legitimately know about one customer account.
 *
 * "Legitimately" is doing work there. The password hash and the Google subject
 * id are never selected — not masked in the response, never read at all, so
 * there is no version of this endpoint that could leak them. What the console
 * needs is whether a password exists, which is a boolean derived here and sent
 * as one.
 *
 * The change history is the part that did not exist before: the console could
 * show what an account looks like now and nothing about how it got there.
 * Accounts older than the AccountChange table have none, and an empty trail is
 * reported as empty rather than dressed up.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getCurrentUser();
    if (!admin || admin.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.mobileUser.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        emailVerified: true,
        phone: true,
        phoneVerified: true,
        profileImage: true,
        authProvider: true,
        accountStatus: true,
        loginCount: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        // Selected only to turn into a boolean below. The hash itself never
        // reaches the response.
        passwordHash: true,
        sessions: {
          orderBy: { createdAt: "desc" },
          select: { id: true, platform: true, createdAt: true, expiresAt: true },
        },
        changes: {
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            field: true,
            fromValue: true,
            toValue: true,
            source: true,
            createdAt: true,
          },
        },
        inquiries: {
          orderBy: { createdAt: "desc" },
          take: 25,
          select: {
            id: true,
            productId: true,
            productName: true,
            productImage: true,
            requestedMOQ: true,
            status: true,
            statusNote: true,
            createdAt: true,
          },
        },
        _count: { select: { inquiries: true, favourites: true, productViews: true } },
      },
    });

    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { passwordHash, ...rest } = user;

    return NextResponse.json({
      user: {
        ...rest,
        hasPassword: Boolean(passwordHash),
        usesWeb: user.sessions.some((s) => s.platform === "WEB"),
        usesApp: user.sessions.some((s) => s.platform === "APP"),
        inquiryCount: user._count.inquiries,
        favouriteCount: user._count.favourites,
        viewCount: user._count.productViews,
        inquiries: user.inquiries.map((i) => ({
          ...i,
          ...describeStatus(i.status, i.statusNote),
        })),
      },
    });
  } catch (error) {
    console.error("Admin mobile user detail error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
