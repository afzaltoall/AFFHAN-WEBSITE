/**
 * "2 hours ago" — the largest unit that fits, so a fortnight reads "2 weeks
 * ago" and not "14 days ago".
 *
 * No imports, so it is safe in a client component. It was written for the
 * customer's inquiry list and is shared from here rather than copied, because
 * the admin's staff list asks the same question of a different column.
 */
export function timeAgo(value: string | Date): string {
  const then = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(then)) return "";

  const seconds = Math.round((Date.now() - then) / 1000);
  // A clock a few seconds ahead of the server should read "just now", not
  // "in 4 seconds".
  if (seconds < 45) return "just now";

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(-Math.round(seconds / size), unit);
  }
  return "just now";
}
