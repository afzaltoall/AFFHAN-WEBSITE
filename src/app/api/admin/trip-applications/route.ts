import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from ".prisma/client";
import { prisma, withDbRetry } from "@/lib/prisma";
import { ADMIN_APPLICATION_INCLUDE, LIST_SELECT, codesFor, forConsole, forList, tripCustomerCodes } from "@/lib/server/trip-admin-rows";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

/**
 * A page of the list. The console reads page after page until `next` is null, so every application is in it: this
 * was a cap of the newest 2,000, and with 2,655 on file the console's figures stood at 2,000 while the oldest 655
 * could not be searched or exported (the owner, 2026-11-01: "2000 romba neram eruku"). A row is about 470 bytes
 * (3,034 rows were 1.38 MB on 2026-11-02), so 5,000 is about 2.3 MB, half of Vercel's 4.5 MB response limit, and the
 * whole list came in one answer that day.
 */
const PAGE = 5000;
/** A page of the Excel export's full rows, about 1.4 KB each: well under Vercel's 4.5 MB response limit. */
const FULL_PAGE = 1000;

/** Where the next page starts: the last row sent, as "<createdAt ISO>~<id>" (newest first, ties broken by id). */
const cursorOf = (row: { createdAt: Date; id: string }) => `${row.createdAt.toISOString()}~${row.id}`;
function olderThan(cursor: string): Prisma.TripApplicationWhereInput | null {
  const cut = cursor.lastIndexOf("~");
  const createdAt = new Date(cursor.slice(0, cut));
  const id = cursor.slice(cut + 1);
  if (cut < 1 || Number.isNaN(createdAt.getTime()) || !id) return null;
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}
const NEWEST_FIRST: Prisma.TripApplicationOrderByWithRelationInput[] = [{ createdAt: "desc" }, { id: "desc" }];

/**
 * The Free China Business Trip's participants, for the console's Free China
 * Trip page. Admins only; deleted ones are left out here and asked for on
 * their own (?deleted=1).
 *
 *   (none)        the list's first page: what its rows, search, filters and figures use, and the customer's
 *                 number (AFFHAN-0001, CustomerCode), read alongside rather than after (lib/server/trip-admin-rows.ts)
 *   ?before=<c>   the page after cursor c (`next` of the page before); with ?full=1 too
 *   ?since=<ISO>  only the applications after that moment: the page asks every 20 s, so a new one shows
 *                 without Refresh (the owner, 2026-10-29: "admin shows it late")
 *   ?full=1       every answer and the account that sent it, for the Excel export
 *   ?deleted=1    the deleted ones instead, for the board's Deleted tab: their Trip IDs are why the newest number
 *                 runs past the count (the owner, 2026-11-02: "china trip users count mismatch"; 10 deleted then);
 *                 with ?full=1 too
 *
 * One application in full, for its panel, is /api/admin/trip-applications/<id>/.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  const params = req.nextUrl.searchParams;
  const sinceRaw = params.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  if (since && Number.isNaN(since.getTime())) return NextResponse.json({ error: "since is not a date." }, { status: 400 });
  const beforeRaw = params.get("before");
  const before = beforeRaw ? olderThan(beforeRaw) : null;
  if (beforeRaw && !before) return NextResponse.json({ error: "before is not a cursor." }, { status: 400 });
  const deleted = params.get("deleted") === "1";
  const which: Prisma.TripApplicationWhereInput = deleted ? { status: "deleted" } : { status: { not: "deleted" } };
  const base: Prisma.TripApplicationWhereInput = { ...which, ...(since ? { createdAt: { gt: since } } : {}) };
  const where = before ? { AND: [base, before] } : base;
  try {
    if (params.get("full") === "1") {
      const rows = await withDbRetry(() => prisma.tripApplication.findMany({ where, orderBy: NEWEST_FIRST, take: FULL_PAGE, include: ADMIN_APPLICATION_INCLUDE }));
      return NextResponse.json({ applications: await forConsole(rows), next: rows.length === FULL_PAGE ? cursorOf(rows[rows.length - 1]) : null });
    }
    const [rows, total, codes] = await Promise.all([
      withDbRetry(() => prisma.tripApplication.findMany({ where, orderBy: NEWEST_FIRST, take: PAGE, select: LIST_SELECT })),
      withDbRetry(() => prisma.tripApplication.count({ where: which })),
      // The first page: every number at once, alongside it. A later page, a few new ones or the deleted: just theirs, after.
      since || before || deleted ? null : tripCustomerCodes(),
    ]);
    return NextResponse.json({
      total,
      applications: forList(rows, codes ?? (await codesFor(rows.map((r) => r.customerKey)))),
      next: rows.length === PAGE ? cursorOf(rows[rows.length - 1]) : null,
    });
  } catch (e) {
    console.error("admin trip applications:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not load applications." }, { status: 500 });
  }
}
