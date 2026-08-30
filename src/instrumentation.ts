/**
 * Development-only keepalive for the Neon compute.
 *
 * The database scales to zero after a few minutes idle. Measured from here,
 * waking it costs 2.2–4.4 seconds, and it is the single largest component of a
 * slow page during local development: the first request after a coffee break
 * pays for the resume, and it happens again every time you stop typing for
 * five minutes.
 *
 * A short query every four minutes keeps the compute up while `npm run dev` is
 * running, and lets it sleep the moment the dev server stops.
 *
 * Deliberately development-only. In production this would hold the compute
 * awake around the clock — roughly 730 compute-hours a month against the 208
 * currently billed — to solve a problem production does not have: Vercel's
 * functions sit beside the database and serve /admin/ in about a second.
 * Keeping it out of production is the whole point of the guard below.
 *
 * Note this does not make queries themselves faster. A warm round trip to
 * us-east-1 from here is ~222ms and bulk transfer is limited by the link, not
 * by Neon. It removes the resume, nothing more.
 */
export async function register() {
  if (process.env.NODE_ENV === "production") return;
  // instrumentation runs in the edge runtime too, where Prisma is unavailable.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) return;

  const { prisma } = await import("@/lib/prisma");

  // Four minutes: comfortably inside the five-minute scale-to-zero, without
  // waking the compute more often than necessary.
  const EVERY = 4 * 60 * 1000;

  const ping = async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      // The dev server should not care. If the database is unreachable the
      // next real query reports it properly, with a stack trace worth reading.
    }
  };

  await ping();
  const timer = setInterval(ping, EVERY);
  // Never hold the process open on this alone — Ctrl+C should still exit.
  timer.unref?.();

  console.log("[dev] Neon keepalive on — pinging every 4 minutes so the compute does not sleep mid-session.");
}
