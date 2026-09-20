import { OFFICE_TIME_ZONE } from "@/lib/datetime";

/**
 * When the office is open, and how to count time in it.
 *
 * The rotation queue hands a customer from one salesperson to the next after
 * two hours of silence, and both halves of that sentence need this module. A
 * customer handed to somebody at three in the morning has been handed to
 * nobody: they are asleep, their two hours run out before they wake, and the
 * lead moves on having been offered to no one. A week of round-the-clock
 * rotation is 84 handovers, most of them into an empty office — which is how
 * a lead can be "offered to the whole team twice" without a single person
 * ever having had a chance to pick up the phone.
 *
 * So rotation happens only while the office is open, and the two hours are two
 * WORKING hours: a lead that lands at 17:30 has an hour before closing and its
 * remaining hour the next working morning, rather than expiring overnight.
 *
 * Monday to Saturday, 09:30 to 18:30, in the office's own timezone — the same
 * one lib/datetime.ts prints every date in.
 */

/** Minutes past midnight, in the office's timezone. */
export const OFFICE_OPENS_AT = 9 * 60 + 30; // 09:30
export const OFFICE_CLOSES_AT = 18 * 60 + 30; // 18:30

/** Sunday is 0, as JavaScript counts. The office is shut on Sundays only. */
const CLOSED_DAYS = new Set([0]);

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: OFFICE_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** An instant, as the office's clock and calendar read it. */
function officeParts(at: Date) {
  const parts = Object.fromEntries(
    PARTS.formatToParts(at).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  ) as Record<string, string>;
  // Midnight comes back as "24" in some runtimes; it is hour 0 of the same day.
  const hour = Number(parts.hour) % 24;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
    minutes: hour * 60 + Number(parts.minute),
    seconds: Number(parts.second),
  };
}

/**
 * How far the office's timezone is from UTC at a given instant, in ms.
 *
 * Derived rather than hardcoded. India has not observed daylight saving since
 * 1945 and +05:30 would be right every time, but a constant offset is a
 * statement about the future, and this is not the file that should be making
 * one.
 */
function offsetMs(at: Date): number {
  const p = officeParts(at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, Math.floor(p.minutes / 60), p.minutes % 60, p.seconds);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant at which the office clock reads this date and minute-of-day. */
function instantAt(year: number, month: number, day: number, minutes: number, near: Date): Date {
  const naive = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, 0);
  // One correction pass is enough for a zone with no transition inside a day,
  // and is still right for one that has: the offset is taken at the candidate
  // instant, not at `near`.
  const first = new Date(naive - offsetMs(near));
  return new Date(naive - offsetMs(first));
}

/** Is the office open at this instant? */
export function isOfficeOpen(at: Date): boolean {
  const p = officeParts(at);
  return !CLOSED_DAYS.has(p.weekday) && p.minutes >= OFFICE_OPENS_AT && p.minutes < OFFICE_CLOSES_AT;
}

/**
 * The next instant the office is open — `at` itself when it already is.
 *
 * Walks forward a day at a time rather than doing calendar arithmetic, because
 * "the next working day" has to skip Sundays and can cross a month, a year or
 * a timezone change, and eight iterations of a cheap loop is not worth being
 * clever about.
 */
export function nextOfficeOpening(at: Date): Date {
  if (isOfficeOpen(at)) return at;
  let cursor = at;
  for (let i = 0; i < 14; i++) {
    const p = officeParts(cursor);
    if (!CLOSED_DAYS.has(p.weekday) && p.minutes < OFFICE_OPENS_AT) {
      return instantAt(p.year, p.month, p.day, OFFICE_OPENS_AT, cursor);
    }
    // Past closing, or a closed day: try the following day from its opening.
    const nextDay = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    const np = officeParts(nextDay);
    cursor = instantAt(np.year, np.month, np.day, OFFICE_OPENS_AT, nextDay);
    if (isOfficeOpen(cursor)) return cursor;
  }
  return cursor;
}

/**
 * `from` plus a number of WORKING minutes.
 *
 * Time spent outside office hours does not count, so two hours given to
 * somebody at 17:30 on Saturday run out at 10:30 on Monday, having actually
 * been two hours in which that person could have done something.
 */
export function addOfficeMinutes(from: Date, minutes: number): Date {
  let cursor = nextOfficeOpening(from);
  let left = minutes;
  for (let i = 0; i < 60 && left > 0; i++) {
    const p = officeParts(cursor);
    const untilClose = OFFICE_CLOSES_AT - p.minutes;
    if (left < untilClose) return new Date(cursor.getTime() + left * 60_000);
    left -= untilClose;
    // Land exactly on closing, then step to the next opening.
    cursor = nextOfficeOpening(new Date(cursor.getTime() + untilClose * 60_000 + 60_000));
  }
  return cursor;
}

/** For the admin's Queue view: how the office reads a moment's working day. */
export function officeDayLabel(at: Date): string {
  const p = officeParts(at);
  return `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}`;
}
