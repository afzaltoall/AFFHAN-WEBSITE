/**
 * A moment as the office reads it: "16 Sept 2026, 5:49 PM".
 *
 * Twelve-hour, with AM/PM — never railway time. en-GB, which the date half
 * reads best in, defaults to the 24-hour clock, and that is how "17:49" kept
 * reaching the screen (CustomerList learned this earlier and says so).
 *
 * One timezone, the office's, stated rather than inherited. Much of the admin
 * renders on the server first, and the server's clock is UTC: a time formatted
 * there with no zone reached Chennai five and a half hours out, and then
 * disagreed with the same time formatted again in the browser. Naming the zone
 * makes the server and every browser print the same thing.
 *
 * No imports, so it works on either side.
 */
export const OFFICE_TIME_ZONE = "Asia/Kolkata";

export function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: OFFICE_TIME_ZONE });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: OFFICE_TIME_ZONE });
  return `${date}, ${time}`;
}

/** Just the clock: "5:49 PM", the office's, twelve-hour. */
export function formatTimeOnly(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: OFFICE_TIME_ZONE });
}

const officeDay = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: OFFICE_TIME_ZONE });

/**
 * An exact moment, as short as it can be and still be unambiguous: "5:49 PM"
 * when it happened today, "18 Sept, 5:49 PM" when it did not.
 *
 * For the places that must say precisely when, rather than how long ago — the
 * console's In-progress chip above all, where "2h" is not the answer to "since
 * when has Karan been on this?". Today is the office's today, not the reader's
 * or the server's: the same string on the server and in every browser.
 */
export function formatSince(value: string | Date, now: Date = new Date()): string {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const time = formatTimeOnly(d);
  if (officeDay(d) === officeDay(now)) return time;
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: OFFICE_TIME_ZONE });
  return `${date}, ${time}`;
}
