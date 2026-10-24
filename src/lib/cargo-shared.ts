/**
 * Cargo tracking's words and rules, for both sides of the wall (the owner, 2026-10-24): the three stages a
 * consignment goes through, what each is called and how it looks, how a number is matched, and how a day is
 * written. No imports, so the browser, the server and the tests read the same.
 *
 * The stages are the office sheet's own, in the order cargo meets them: at the port of loading, at sea, in customs.
 * The colours are the sheet's too (orange, blue, yellow), so the staff read the page as they read the spreadsheet.
 */
export const CARGO_STATUSES = ["IN_POL_PORT", "IN_SAILING", "IN_CUSTOMS"] as const;
export type CargoStatus = (typeof CARGO_STATUSES)[number];
export const isCargoStatus = (v: unknown): v is CargoStatus =>
  typeof v === "string" && (CARGO_STATUSES as readonly string[]).includes(v);

export const CARGO_STATUS_META: Record<
  CargoStatus,
  { label: string; event: string; chip: string; chipDark: string; dot: string; ring: string }
> = {
  IN_POL_PORT: {
    label: "In POL port",
    event: "At the port of loading",
    chip: "bg-orange-500/15 text-orange-800",
    chipDark: "bg-orange-500/20 text-orange-300",
    dot: "bg-orange-500",
    ring: "ring-orange-500",
  },
  IN_SAILING: {
    label: "In sailing",
    event: "Sailing",
    chip: "bg-sky-500/15 text-sky-800",
    chipDark: "bg-sky-500/20 text-sky-300",
    dot: "bg-sky-500",
    ring: "ring-sky-500",
  },
  IN_CUSTOMS: {
    label: "In customs",
    event: "In customs clearance",
    chip: "bg-yellow-400/30 text-yellow-900",
    chipDark: "bg-yellow-400/20 text-yellow-200",
    dot: "bg-yellow-400",
    ring: "ring-yellow-400",
  },
};

/** "co 26-000002" and "CO-26-000002" are one number: upper case, letters and digits only. */
export const cargoKey = (reference: string) => reference.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The longest each field may be. */
export const CARGO_LIMITS = { reference: 40, customer: 120, type: 40, port: 60, event: 160 } as const;

/** A day (a DATE column) as yyyy-mm-dd. */
export const isoDay = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/** "17 Aug 2026", from yyyy-mm-dd, as the calendar day it is: no time zone can move it to the day before. */
export function fmtDay(day: string | null | undefined, withYear = true): string {
  if (!day) return "";
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

/** Today in the office's calendar (Chennai), as yyyy-mm-dd: the day an update is dated unless the assigner says. */
export function officeToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** What the public tracker answers with: the number, the stage, and the timeline. Nothing of the sheet. */
export interface CargoTrack {
  reference: string;
  status: CargoStatus;
  updatedAt: string;
  events: { date: string; name: string; status: CargoStatus }[];
}
