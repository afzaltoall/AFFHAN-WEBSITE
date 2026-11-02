import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { allReferredApplications } from "@/lib/server/trip-referrals";

export const dynamic = "force-dynamic";

/** Every application that came with a referral code, with its employee, for the console's Excel export. Admins only. */
export async function GET() {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json({ referrals: await allReferredApplications() }, { headers: { "Cache-Control": "no-store" } });
}
