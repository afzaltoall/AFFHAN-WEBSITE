import { NextResponse } from "next/server";
import { refreshSnapshots } from "@/lib/snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The daily refresh (lib/snapshots.ts): the name flags, the category counts,
 * the homepage's draws for today and tomorrow, the hero's pool. Vercel's cron
 * calls it at 18:00 UTC, 23:30 in India, half an hour before the day's draws
 * turn over (vercel.json); any other caller with CRON_SECRET may too, and a
 * call when nothing is due answers at once.
 *
 *   GET /api/cron/refresh/            if due
 *   GET /api/cron/refresh/?force=1    now, whatever was done before
 *
 * Calls from cron-job.org's quarter-hours, if it is given this URL, are cheap:
 * they do nothing until something is due, and carry a long re-flag forward.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const force = new URL(request.url).searchParams.get("force") === "1";
  const report = await refreshSnapshots({ force });
  return NextResponse.json({ ok: !report.failed?.length, ...report }, { status: report.failed?.includes("refresh") ? 500 : 200 });
}
