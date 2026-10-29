import { NextResponse } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";
import { ADMIN_APPLICATION_INCLUDE, forConsole } from "@/lib/server/trip-admin-rows";
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
 * Each application comes with the account that sent it, when it was sent
 * signed in, and that customer's number (AFFHAN-0001, CustomerCode), so the
 * team can see exactly who registered: Trip ID, account and every answer
 * (lib/server/trip-admin-rows.ts). Never the password hash or the Google id.
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
          include: ADMIN_APPLICATION_INCLUDE,
        }),
        prisma.tripApplication.count({ where: { status: { not: "deleted" } } }),
      ]),
    );
    return NextResponse.json({ total, applications: await forConsole(rows) });
  } catch (e) {
    console.error("admin trip applications:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not load applications." }, { status: 500 });
  }
}
