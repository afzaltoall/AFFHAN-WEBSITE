import { NextResponse } from "next/server";
import { refuseUnlessCron } from "@/lib/cron-auth";
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
  // The door every cron route has (lib/cron-auth.ts): the secret compared in
  // constant time, and refused outright when it is missing or too short.
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  const force = new URL(request.url).searchParams.get("force") === "1";
  const report = await refreshSnapshots({ force });
  return NextResponse.json({ ok: !report.failed?.length, ...report }, { status: report.failed?.includes("refresh") ? 500 : 200 });
}
