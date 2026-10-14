/**
 * The keys the homepage's draws are made for (lib/homeGrid.ts): the day and the
 * week as India has them. The grid's picks change at midnight on Monday, IST;
 * the spotlight, rails, trades and mix at every midnight, IST.
 *
 * The daily refresh (lib/snapshots.ts) makes the draws for today and for
 * tomorrow, and the grid for this week and for tomorrow's week, so the draw a
 * visitor needs after midnight was made before it: none is made on a request.
 *
 * Free of path aliases and other modules, so it is tested on its own
 * (tests/perf/draw-keys.test.mjs).
 */

/** The date in India, as midnight UTC of that date: the week runs Monday to Sunday there. */
export function istDay(now: Date): Date {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/** Today as a count of days, as India has it: what the daily draws are keyed by. */
export const dayOf = (now: Date): number => Math.floor(istDay(now).getTime() / 86_400_000);

/** The ISO week a date falls in, in India: the picks change at midnight on Monday, IST. */
export function weekKey(now = new Date()): string {
  const d = istDay(now);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const week = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** The week's Monday to Sunday, as the band says it: "5–11 Oct", or "28 Sep – 4 Oct". */
export function weekSpan(now = new Date()): string {
  const monday = istDay(now);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() || 7) - 1));
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  const month = (d: Date) => MONTHS[d.getUTCMonth()];
  return monday.getUTCMonth() === sunday.getUTCMonth()
    ? `${monday.getUTCDate()}–${sunday.getUTCDate()} ${month(sunday)}`
    : `${monday.getUTCDate()} ${month(monday)} – ${sunday.getUTCDate()} ${month(sunday)}`;
}

/** What a refresh at `now` makes: today's and tomorrow's days, and this week and tomorrow's week (once each). */
export function drawKeys(now: Date): { days: number[]; weeks: { key: string; span: string }[] } {
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const weeks = [now, tomorrow].map((d) => ({ key: weekKey(d), span: weekSpan(d) }));
  return {
    days: [dayOf(now), dayOf(tomorrow)],
    weeks: weeks.filter((w, i) => weeks.findIndex((x) => x.key === w.key) === i),
  };
}
