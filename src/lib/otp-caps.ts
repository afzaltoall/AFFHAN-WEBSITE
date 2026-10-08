/**
 * How many text-message codes may go out (security audit 2026-10-08, H7).
 * Pure: lib/phone-auth.ts counts the sends in the database and this says
 * whether one more may go, so the rule can be tested on its own.
 *
 * Every code is a text Twilio bills for, and anyone can ask for one to any
 * number, which is how "SMS pumping" runs up a bill with texts to numbers
 * nobody needed. The 60-second wait per number never stopped that, because
 * every new number started fresh. So, on top of the wait:
 *   - per number: 5 an hour, 10 a day;
 *   - per connection (IP): 10 an hour, 30 a day;
 *   - for the whole site: 300 a day, unless OTP_DAILY_CAP says otherwise.
 *
 * A "day" is the last 24 hours, not the calendar day.
 *
 * Kept free of path aliases and of other modules, so tests can load it as it is.
 */

export const OTP_PER_NUMBER = { hour: 5, day: 10 } as const;
export const OTP_PER_IP = { hour: 10, day: 30 } as const;
export const OTP_SITE_PER_DAY = 300;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export interface OtpCounts {
  numberHour: number;
  numberDay: number;
  ipHour: number;
  ipDay: number;
  siteDay: number;
}

export type OtpCap = "site_day" | "ip_day" | "ip_hour" | "number_day" | "number_hour";

/** The cap one more code would break, widest first, or null when it may go. */
export function otpCapReached(counts: OtpCounts, siteCap: number = OTP_SITE_PER_DAY): OtpCap | null {
  if (counts.siteDay >= siteCap) return "site_day";
  if (counts.ipDay >= OTP_PER_IP.day) return "ip_day";
  if (counts.ipHour >= OTP_PER_IP.hour) return "ip_hour";
  if (counts.numberDay >= OTP_PER_NUMBER.day) return "number_day";
  if (counts.numberHour >= OTP_PER_NUMBER.hour) return "number_hour";
  return null;
}

/** OTP_DAILY_CAP read as a whole number above zero, or the default. */
export function siteDailyCap(raw: string | undefined): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isInteger(n) && n > 0 ? n : OTP_SITE_PER_DAY;
}
