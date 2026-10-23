import { NextResponse } from "next/server";
import { runPoolSweep } from "@/lib/lead-pool";
import { brevoKeepAlive } from "@/lib/brevo";
import { refuseUnlessCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The open pool's sweep (lib/lead-pool.ts, runPoolSweep): customers taken and
 * left silent for two office hours, or In progress and quiet for two office
 * days, go back to the pool; a week unhandled is Invalid; and anybody with live
 * requests and no place in the pool yet is taken in. The address keeps its old
 * name, rotate, because the scheduler calls it by that.
 *
 * Every fifteen minutes or so. The windows it enforces are office hours and
 * days, so the granularity only decides how late a release can be (a quarter
 * of an hour), not whether it happens.
 *
 * WHO CALLS THIS. Vercel's own cron, every fifteen minutes (vercel.json,
 * "*\/15 * * * *"): the project is on Vercel Pro, which runs cron jobs as often
 * as once a minute (the owner, 2026-10-22; the once-a-day limit is Hobby's).
 * An external scheduler (cron-job.org, set up by somebody else) may call it as
 * well, with the same bearer token. Two callers are safe: a run that finds
 * nothing to do does nothing, and every move it makes is a conditional update
 * that only one of two overlapping runs can win (lib/lead-pool.ts).
 *
 *   GET /api/cron/leads/rotate/
 *   Authorization: Bearer $CRON_SECRET
 *
 * The trailing slash matters. The site has trailingSlash on, so the address
 * without it answers 308 and the sweep never runs: Vercel's cron does not
 * follow a redirect, and a scheduler that does not either just records the
 * 308. vercel.json named it without the slash until 2026-10-22.
 *
 * Fails closed: with no CRON_SECRET configured the route refuses everybody
 * rather than letting anybody release the sales team's leads.
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
 * clock runs out on anybody who is not at work.
 */
export async function GET(request: Request) {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const nowParam = url.searchParams.get("now");

  // ?now= moves the clock, and a moved clock can release every customer in the
  // pool at once — "pretend it is Tuesday" run against
  // production during an incident is a worse outcome than whatever was being
  // debugged. The bearer token is not enough of a gate for that: it is held by
  // a scheduler, sits in an environment variable, and is meant for a machine
  // that never needs this.
  //
  // So it is off unless a deployment says otherwise. LEAD_QUEUE_TEST_CLOCK is
  // set on a local or staging build and nowhere else; production simply does
  // not have it, and there is nothing to get wrong at the call site. It
  // refuses loudly rather than ignoring the parameter, because a test that
  // silently ran against the real clock would report a pass it did not earn.
  if (nowParam && process.env.LEAD_QUEUE_TEST_CLOCK !== "1") {
    return NextResponse.json(
      { error: "The clock override is not enabled on this deployment. Set LEAD_QUEUE_TEST_CLOCK=1 on a test build to use ?now=." },
      { status: 403 }
    );
  }

  const now = nowParam ? new Date(nowParam) : new Date();
  if (nowParam && !Number.isFinite(now.getTime())) {
    return NextResponse.json({ error: "now must be an ISO date" }, { status: 400 });
  }

  // One run a day, Vercel's own (it calls as "vercel-cron/1.0") at 05:00 UTC,
  // also keeps Brevo's API key in use (lib/brevo.ts, brevoKeepAlive): once a day,
  // not on every quarter-hour now that Vercel calls every fifteen minutes. The
  // real clock, not ?now=. Alongside the sweep, never in its way: it cannot
  // throw, a failure is a log line, and the answer below is the sweep's whatever
  // Brevo said.
  const wall = new Date();
  const dailyRun = wall.getUTCHours() === 5 && wall.getUTCMinutes() < 15;
  const keepAlive = request.headers.get("user-agent")?.startsWith("vercel-cron/") && dailyRun ? brevoKeepAlive() : null;

  try {
    const report = await runPoolSweep({ now, dryRun });
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    // The name only: a stack in a log the scheduler can read back is a gift to
    // nobody useful.
    console.error("lead pool sweep failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  } finally {
    await keepAlive;
  }
}
