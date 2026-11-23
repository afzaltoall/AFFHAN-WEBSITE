import { NextResponse } from "next/server";
import { istDayAfter, istDayStart } from "@/lib/trip-referral-shared";
import { saveInstagramSettings } from "@/lib/server/instagram-task";
import { instagramErrorResponse, readInstagramAdmin } from "@/lib/server/instagram-auth";

export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const whole = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null);
/** A date field's value: "" or nothing for none, a yyyy-mm-dd day, or undefined when it is neither. */
const day = (v: unknown): string | null | undefined => (v === "" || v == null ? null : typeof v === "string" && DAY.test(v) ? v : undefined);

/**
 * The Instagram task's settings (the console's Instagram task page): on or off, the accounts each person makes, the
 * posts and followers each account needs, the prize, and the dates in India's calendar (the last day counts all day).
 * Admins only.
 */
export async function POST(req: Request) {
  const who = await readInstagramAdmin();
  if (!who.ok) return who.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const accounts = whole(body.accountsPerPerson, 1, 50);
  const posts = whole(body.postsPerAccount, 1, 100_000);
  const followers = whole(body.followersPerAccount, 1, 10_000_000);
  const prize = whole(body.prizeRupees, 0, 10_000_000);
  const startDay = day(body.startDay);
  const endDay = day(body.endDay);
  if (accounts === null || posts === null || followers === null || prize === null || typeof body.enabled !== "boolean" || startDay === undefined || endDay === undefined) {
    return NextResponse.json({ error: "Accounts, posts and followers are whole numbers from 1, and the prize a whole number of rupees." }, { status: 400 });
  }
  if (startDay && endDay && endDay < startDay) return NextResponse.json({ error: "The last day is before the first." }, { status: 400 });
  try {
    const saved = await saveInstagramSettings(
      {
        enabled: body.enabled,
        accountsPerPerson: accounts,
        postsPerAccount: posts,
        followersPerAccount: followers,
        prizeRupees: prize,
        startsAt: startDay ? istDayStart(startDay) : null,
        endsAt: endDay ? istDayAfter(endDay) : null,
      },
      who.actor.name,
    );
    return NextResponse.json(saved);
  } catch (e) {
    return instagramErrorResponse(e);
  }
}
