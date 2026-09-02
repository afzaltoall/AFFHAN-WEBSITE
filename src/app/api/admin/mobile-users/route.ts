import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Customer accounts, optionally narrowed to the client they signed in from.
 *
 * There is one customer table. "Website users" and "app users" are not two
 * populations — they are the same people, told apart by whether any session on
 * the account was opened from a browser or from the Android app. Somebody who
 * uses both appears on both lists, and that is correct rather than a
 * duplication bug: the question each list answers is "who reaches us this
 * way", not "who belongs to us exclusively".
 *
 * Sessions expire and are deleted, so this reflects who has signed in
 * recently, not who ever did. The account rows themselves are never removed by
 * that, which is why the unfiltered list is always the larger one.
 */
export async function GET(request: Request) {
  try {
    const admin = await getCurrentUser();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = (searchParams.get("search") || "").trim();
    const platformParam = (searchParams.get("platform") || "").toUpperCase();
    const platform = platformParam === "WEB" || platformParam === "APP" ? platformParam : null;

    const skip = (page - 1) * limit;

    const filters = [];

    if (search) {
      filters.push({
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          // Phone accounts have no email, so without this a number was the one
          // thing identifying them and the one thing you could not search by.
          { phone: { contains: search } },
        ],
      });
    }

    if (platform) {
      filters.push({ sessions: { some: { platform } } });
    }

    const where = filters.length ? { AND: filters } : {};

    const [total, users] = await Promise.all([
      prisma.mobileUser.count({ where }),
      prisma.mobileUser.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastLoginAt: { sort: "desc", nulls: "last" } },
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          phoneVerified: true,
          profileImage: true,
          authProvider: true,
          emailVerified: true,
          accountStatus: true,
          loginCount: true,
          lastLoginAt: true,
          createdAt: true,
          // Never passwordHash or googleId. What the console needs to know is
          // whether a password exists, which the count answers without the
          // hash ever leaving the database.
          _count: { select: { inquiries: true, favourites: true, changes: true } },
          sessions: { select: { platform: true, createdAt: true } },
        },
      }),
    ]);

    return NextResponse.json({
      data: users.map(({ sessions, ...u }) => ({
        ...u,
        // Which clients this account has actually been used from.
        usesWeb: sessions.some((s) => s.platform === "WEB"),
        usesApp: sessions.some((s) => s.platform === "APP"),
        // Sessions opened before the platform column was filled in. Shown as
        // "unknown" rather than guessed at — an old app session and an old
        // browser session are indistinguishable now, and inventing an answer
        // would put people on the wrong list.
        unknownSessions: sessions.filter((s) => !s.platform).length,
        activeSessions: sessions.length,
        inquiryCount: u._count.inquiries,
        favouriteCount: u._count.favourites,
        changeCount: u._count.changes,
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Admin Mobile Users Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
