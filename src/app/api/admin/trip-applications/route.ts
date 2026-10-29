import { NextResponse, type NextRequest } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";
import { ADMIN_APPLICATION_INCLUDE, LIST_SELECT, codesFor, forConsole, forList, tripCustomerCodes } from "@/lib/server/trip-admin-rows";
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
 *   (none)        the list: what its rows, search, filters and figures use, and the customer's number
 *                 (AFFHAN-0001, CustomerCode), read alongside rather than after (lib/server/trip-admin-rows.ts)
 *   ?since=<ISO>  only the applications after that moment: the page asks every 20 s, so a new one shows
 *                 without Refresh (the owner, 2026-10-29: "admin shows it late")
 *   ?full=1       every answer and the account that sent it, for the Excel export
 *
 * One application in full, for its panel, is /api/admin/trip-applications/<id>/.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  const params = req.nextUrl.searchParams;
  const sinceRaw = params.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  if (since && Number.isNaN(since.getTime())) return NextResponse.json({ error: "since is not a date." }, { status: 400 });
  const where = { status: { not: "deleted" }, ...(since ? { createdAt: { gt: since } } : {}) };
  try {
    if (params.get("full") === "1") {
      const rows = await withDbRetry(() => prisma.tripApplication.findMany({ where, orderBy: { createdAt: "desc" }, take: TAKE, include: ADMIN_APPLICATION_INCLUDE }));
      return NextResponse.json({ applications: await forConsole(rows) });
    }
    const [rows, total, codes] = await Promise.all([
      withDbRetry(() => prisma.tripApplication.findMany({ where, orderBy: { createdAt: "desc" }, take: TAKE, select: LIST_SELECT })),
      withDbRetry(() => prisma.tripApplication.count({ where: { status: { not: "deleted" } } })),
      // The whole list: every number at once, alongside it. A few new ones: just theirs, after.
      since ? null : tripCustomerCodes(),
    ]);
    return NextResponse.json({ total, applications: forList(rows, codes ?? (await codesFor(rows.map((r) => r.customerKey)))) });
  } catch (e) {
    console.error("admin trip applications:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not load applications." }, { status: 500 });
  }
}
