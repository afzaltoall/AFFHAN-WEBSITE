import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { saveReferralSettings } from "@/lib/server/trip-referrals";
import { istDayAfter, istDayStart } from "@/lib/trip-referral-shared";

export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const whole = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null);
/** A date field's value: "" or nothing for none, a yyyy-mm-dd day, or undefined when it is neither. */
const day = (v: unknown): string | null | undefined => (v === "" || v == null ? null : typeof v === "string" && DAY.test(v) ? v : undefined);

/**
 * The referral task's settings (the console's Employee tasks): on or off, points per referral, rupees per point, the
 * target, and the dates in India's calendar (the end date counts all day). Admins only.
 */
export async function POST(req: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const points = whole(body.pointsPerReferral, 1, 100_000);
  const rate = whole(body.rupeesPerPoint, 1, 1_000);
  const target = whole(body.target, 1, 100_000);
  const startDay = day(body.startDay);
  const endDay = day(body.endDay);
  if (points === null || rate === null || target === null || typeof body.enabled !== "boolean" || startDay === undefined || endDay === undefined) {
    return NextResponse.json({ error: "Points, rupees and the target are whole numbers from 1." }, { status: 400 });
  }
  if (startDay && endDay && endDay < startDay) return NextResponse.json({ error: "The end date is before the start date." }, { status: 400 });
  const saved = await saveReferralSettings(
    { enabled: body.enabled, pointsPerReferral: points, rupeesPerPoint: rate, target, startsAt: startDay ? istDayStart(startDay) : null, endsAt: endDay ? istDayAfter(endDay) : null },
    admin.name || admin.email,
  );
  return NextResponse.json(saved);
}
