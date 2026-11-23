import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { deleteRepeats } from "@/lib/server/trip-duplicates";

export const dynamic = "force-dynamic";

/**
 * Delete repeats from Employee tasks → Duplicates (2026-11-23): { ids, byHand? }, the later applications of people who applied
 * more than once. The server works out again which of them are later applications in a group now, and deletes only
 * those that are not paid, not drawn live and not kept (lib/server/trip-duplicates.ts, deleteRepeats); a soft delete,
 * restored from Participants → Deleted. Admins only.
 */
export async function POST(req: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; byHand?: unknown };
  const ids = Array.isArray(body.ids) && body.ids.length > 0 && body.ids.length <= 1000 && body.ids.every((x) => typeof x === "string") ? (body.ids as string[]) : null;
  if (!ids) return NextResponse.json({ error: "Send the applications to delete." }, { status: 400 });
  // byHand: one row's own Delete (any application in a group, never a paid or live-drawn one); otherwise repeats only.
  return NextResponse.json(await deleteRepeats(ids, admin.name || admin.email, body.byHand === true));
}
