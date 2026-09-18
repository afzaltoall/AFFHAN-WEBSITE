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
