import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setReferralCode } from "@/lib/server/trip-referrals";

export const dynamic = "force-dynamic";

/**
 * Make or change an employee's referral code: { employeeId, code } (the owner, 2026-11-03). An empty code makes one
 * from their name. The rules are lib/server/trip-referrals.ts's (setReferralCode). Admins only.
 */
export async function POST(req: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { employeeId?: unknown; code?: unknown };
  if (typeof body.employeeId !== "string" || !body.employeeId) return NextResponse.json({ error: "Send the employee and the code." }, { status: 400 });
  try {
    const r = await setReferralCode(body.employeeId, body.code ?? "");
    return r.ok ? NextResponse.json({ code: r.code }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    console.error("trip referral code:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The code was not saved. Try again." }, { status: 500 });
  }
}
