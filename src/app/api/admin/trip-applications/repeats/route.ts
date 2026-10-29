import { NextResponse } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";
import { ADMIN_APPLICATION_INCLUDE, forConsole } from "@/lib/server/trip-admin-rows";
import { getCurrentUser } from "@/lib/session";
import { repeatGroups } from "@/lib/trip-repeats";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

/**
 * The console's "Registered again": every Free China Trip application still
 * counted (not marked spam, not deleted), grouped where they share a mobile
 * number (lib/trip-repeats.ts; never the name), with each grouped application
 * in full as the list has it. Over the whole table, not the list's newest
 * 2,000. Marking the extra ones spam, or deleting them, takes them out of
 * their group; a group left with one application is gone. Admins only.
 */
export async function GET() {
  if (!(await requireAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const keys = await withDbRetry(() =>
      prisma.tripApplication.findMany({
        where: { status: { notIn: ["spam", "deleted"] } },
        select: { id: true, customerKey: true, createdAt: true },
      }),
    );
    const groups = repeatGroups(keys);
    const ids = groups.flatMap((g) => g.ids);
    const rows = ids.length
      ? await withDbRetry(() => prisma.tripApplication.findMany({ where: { id: { in: ids } }, include: ADMIN_APPLICATION_INCLUDE }))
      : [];
    const byId = new Map((await forConsole(rows)).map((r) => [r.id, r]));
    return NextResponse.json({
      checked: keys.length,
      groups: groups.map((g) => ({ applications: g.ids.flatMap((id) => byId.get(id) ?? []) })),
    });
  } catch (e) {
    console.error("admin trip repeats:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not check for repeat applications." }, { status: 500 });
  }
}
