import { NextResponse } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

/** The newest this many; `total` goes back too, so a cap never passes for the whole table. */
const TAKE = 2000;

/**
 * The Free China Business Trip's participants, for the console's Free China
 * Trip page. Admins only; deleted ones are left out here and counted
 * separately.
 *
 * Each application comes with the account that sent it (signing in is
 * required to apply) and that customer's number (AFFHAN-0001, CustomerCode),
 * so the team can see exactly who registered: Trip ID, account and every
 * answer. Never the password hash or the Google id.
 */
export async function GET() {
  if (!(await requireAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const [rows, total] = await withDbRetry(() =>
      Promise.all([
        prisma.tripApplication.findMany({
          where: { status: { not: "deleted" } },
          orderBy: { createdAt: "desc" },
          take: TAKE,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                authProvider: true,
                emailVerified: true,
                phoneVerified: true,
                profileImage: true,
                accountStatus: true,
                loginCount: true,
                lastLoginAt: true,
                createdAt: true,
              },
            },
          },
        }),
        prisma.tripApplication.count({ where: { status: { not: "deleted" } } }),
      ]),
    );
    const keys = [...new Set(rows.map((r) => r.customerKey).filter((k): k is string => !!k))];
    const codes = keys.length
      ? await withDbRetry(() => prisma.customerCode.findMany({ where: { customerKey: { in: keys } }, select: { customerKey: true, code: true } }))
      : [];
    const codeOf = new Map(codes.map((c) => [c.customerKey, c.code]));
    return NextResponse.json({
      total,
      applications: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        customerCode: r.customerKey ? codeOf.get(r.customerKey) ?? null : null,
        user: r.user
          ? {
              ...r.user,
              createdAt: r.user.createdAt.toISOString(),
              lastLoginAt: r.user.lastLoginAt ? r.user.lastLoginAt.toISOString() : null,
            }
          : null,
      })),
    });
  } catch (e) {
    console.error("admin trip applications:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not load applications." }, { status: 500 });
  }
}
