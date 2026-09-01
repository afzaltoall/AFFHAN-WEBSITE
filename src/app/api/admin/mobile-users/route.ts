import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // Admin authorization
    const admin = await getCurrentUser();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const search = searchParams.get("search") || "";

    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [total, users] = await Promise.all([
      prisma.mobileUser.count({ where }),
      prisma.mobileUser.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          profileImage: true,
          authProvider: true,
          emailVerified: true,
          accountStatus: true,
          loginCount: true,
          lastLoginAt: true,
          createdAt: true,
          // Explicitly EXCLUDE passwordHash and googleId from admin response
        },
      }),
    ]);

    return NextResponse.json({
      data: users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Admin Mobile Users Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
