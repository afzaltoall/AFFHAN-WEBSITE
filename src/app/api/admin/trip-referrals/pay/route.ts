import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { payReferrals } from "@/lib/server/trip-referrals";

export const dynamic = "force-dynamic";

/**
 * Mark an employee paid for everything counted and not yet paid: { employeeId, note? }. The payment is recorded with
 * its referrals, points and rupees, and who marked it (lib/server/trip-referrals.ts). Admins only.
 */
export async function POST(req: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { employeeId?: unknown; note?: unknown };
  if (typeof body.employeeId !== "string" || !body.employeeId) return NextResponse.json({ error: "Which employee?" }, { status: 400 });
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null;
  try {
    const result = await payReferrals(body.employeeId, admin.name || admin.email, note);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json(result.payout);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "The payment was not recorded. Try again." }, { status: 409 });
  }
}
