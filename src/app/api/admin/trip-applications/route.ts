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
 * Free China trip applications, for the console's Trip applications page.
 * Admins only; deleted ones are left out here and counted separately.
 */
export async function GET() {
  if (!(await requireAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const [rows, total] = await withDbRetry(() =>
      Promise.all([
        prisma.tripApplication.findMany({ where: { status: { not: "deleted" } }, orderBy: { createdAt: "desc" }, take: TAKE }),
        prisma.tripApplication.count({ where: { status: { not: "deleted" } } }),
      ]),
    );
    return NextResponse.json({
      total,
      applications: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    });
  } catch (e) {
    console.error("admin trip applications:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not load applications." }, { status: 500 });
  }
}
