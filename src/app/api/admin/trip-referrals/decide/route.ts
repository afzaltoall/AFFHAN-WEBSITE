import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { decideReferrals } from "@/lib/server/trip-referrals";
import { isReferralState } from "@/lib/trip-referral-shared";

export const dynamic = "force-dynamic";

/**
 * Count referred applications, decline them, or set them back to waiting: { ids, state }. Paid ones stay as they were
 * (lib/server/trip-referrals.ts). Admins only.
 */
export async function POST(req: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; state?: unknown };
  const ids = Array.isArray(body.ids) && body.ids.length > 0 && body.ids.length <= 1000 && body.ids.every((x) => typeof x === "string") ? (body.ids as string[]) : null;
  if (!ids || !isReferralState(body.state)) return NextResponse.json({ error: "Send the applications and a state: waiting, counted or not_counted." }, { status: 400 });
  const count = await decideReferrals(ids, body.state, admin.name || admin.email);
  return NextResponse.json({ count });
}
