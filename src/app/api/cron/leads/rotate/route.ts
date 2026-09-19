import { NextResponse } from "next/server";
import { runRotation } from "@/lib/lead-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The rotation sweep: hand on the customers nobody has picked up.
 *
 * Every fifteen minutes or so. The window it enforces is two working hours, so
 * the granularity only decides how late a handover can be (a quarter of an
 * hour), not whether it happens.
 *
 * WHO CALLS THIS. Vercel's own cron runs a job once a day on this plan, which
 * is nowhere near often enough. The project already solved that for the
 * catalogue sync: an external scheduler (cron-job.org) calls the route on a
 * schedule of its own. This is the same arrangement and the same bearer token,
 * so there is one secret and one thing to configure rather than two.
 *
 * vercel.json also has this route at 05:00 UTC — 10:30 in the office, half an
 * hour after it opens. That is not the schedule; it is the net under it. If
 * the external scheduler stops, customers still move once a day and somebody
 * notices a queue that has gone quiet rather than one that has gone silent.
 *
 *   GET /api/cron/leads/rotate
 *   Authorization: Bearer $CRON_SECRET
 *
 * Fails closed: with no CRON_SECRET configured the route refuses everybody
 * rather than letting anybody reassign the sales team's leads.
 *
 * Two parameters, both behind the same token, both there because a job that
 * can only be understood by watching it work is a job nobody dares run:
 *
 *   ?dryRun=1     say what would happen and change nothing
 *   ?now=<ISO>    judge the clock as if it were then, which is the only
 *                 practical way to ask "what will this do at 3am on Sunday?"
 *                 without waiting until 3am on Sunday
 *
 * It is safe to call at any hour. Outside office hours the sweep still runs —
 * that is how a customer whose week has run out is marked INVALID — but no
 * customer is handed to anybody who is not at work.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const nowParam = url.searchParams.get("now");
  const now = nowParam ? new Date(nowParam) : new Date();
  if (nowParam && !Number.isFinite(now.getTime())) {
    return NextResponse.json({ error: "now must be an ISO date" }, { status: 400 });
  }

  try {
    const report = await runRotation({ now, dryRun });
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    // The name only: a stack in a log the scheduler can read back is a gift to
    // nobody useful.
    console.error("lead rotation failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Rotation failed" }, { status: 500 });
  }
}
