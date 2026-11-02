import { NextResponse, type NextRequest } from "next/server";
import { checkTripReferralCheckRateLimit, limitReached } from "@/lib/rate-limit";
import { liveReferralCode } from "@/lib/server/trip-referrals";

export const dynamic = "force-dynamic";

/**
 * Whether the code in an employee's link (?ref=) is live, an active employee's (2026-11-02). Asked once a visit
 * through a link (TripRefCapture): a link that credits nobody, a former employee's or a mistyped one, is forgotten,
 * and its visitor applies like anyone else, never asked for ID proof. Answers yes or no, never whose.
 */
export async function GET(req: NextRequest) {
  const limited = await checkTripReferralCheckRateLimit(req);
  if (!limited.success) return limitReached("Many links have been checked from this connection.", limited);
  try {
    const live = await liveReferralCode(req.nextUrl.searchParams.get("code"));
    return NextResponse.json({ live: !!live }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("trip referral check:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not check the link." }, { status: 500 });
  }
}
