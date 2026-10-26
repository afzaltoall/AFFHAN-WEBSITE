/**
 * Cargo tracking's words and rules, for both sides of the wall (the owner, 2026-10-24): the stages a consignment
 * goes through, what each is called and how it looks, its container types, how a number is matched, and how a day
 * is written. No imports, so the browser, the server and the tests read the same.
 *
 * The stages are the owner's own list (2026-10-26, "Shipping Requirements"), in the order cargo meets them: loaded,
 * on the vessel, at sea, discharged at the port of discharge, through customs, in the warehouse. Each has its own
 * colour, the sheet's first three kept (loaded orange, sailing blue, customs yellow).
 */
export const CARGO_STATUSES = ["CARGO_LOADED", "VESSEL_LOADING", "VESSEL_SAILING", "VESSEL_DISCHARGED", "IN_CUSTOMS", "IN_WAREHOUSE"] as const;
export type CargoStatus = (typeof CARGO_STATUSES)[number];
export const isCargoStatus = (v: unknown): v is CargoStatus =>
  typeof v === "string" && (CARGO_STATUSES as readonly string[]).includes(v);

/**
 * The first three stages' codes (2026-10-24 to -26), still on rows written then: each read as the stage it became.
 * IN_CUSTOMS kept its code. New updates are written only in the codes above.
 */
const EARLIER_CODES: Record<string, CargoStatus> = { IN_POL_PORT: "CARGO_LOADED", IN_SAILING: "VESSEL_SAILING" };

/** A stored code as a stage: today's codes as they are, the first ones as what they became, anything else the first. */
export const cargoStatusOf = (code: string): CargoStatus => (isCargoStatus(code) ? code : EARLIER_CODES[code] ?? "CARGO_LOADED");

export const CARGO_STATUS_META: Record<
  CargoStatus,
  { label: string; event: string; chip: string; chipDark: string; dot: string; ring: string }
> = {
  CARGO_LOADED: {
    label: "Cargo loaded",
    event: "Cargo loaded",
    chip: "bg-orange-500/15 text-orange-800",
    chipDark: "bg-orange-500/20 text-orange-300",
    dot: "bg-orange-500",
    ring: "ring-orange-500",
  },
  VESSEL_LOADING: {
    label: "Vessel loading",
    event: "Loading on the vessel",
    chip: "bg-pink-500/15 text-pink-800",
    chipDark: "bg-pink-500/20 text-pink-300",
    dot: "bg-pink-500",
    ring: "ring-pink-500",
  },
  VESSEL_SAILING: {
    label: "Vessel sailing",
    event: "Vessel sailing",
    chip: "bg-sky-500/15 text-sky-800",
    chipDark: "bg-sky-500/20 text-sky-300",
    dot: "bg-sky-500",
    ring: "ring-sky-500",
  },
  VESSEL_DISCHARGED: {
    label: "Vessel discharged",
    event: "Discharged at the port of discharge",
    chip: "bg-indigo-500/15 text-indigo-800",
    chipDark: "bg-indigo-500/20 text-indigo-300",
    dot: "bg-indigo-500",
    ring: "ring-indigo-500",
  },
  IN_CUSTOMS: {
    label: "In customs clearance",
    event: "In customs clearance",
    chip: "bg-yellow-400/30 text-yellow-900",
    chipDark: "bg-yellow-400/20 text-yellow-200",
    dot: "bg-yellow-400",
    ring: "ring-yellow-400",
  },
  IN_WAREHOUSE: {
    label: "In warehouse",
    event: "In warehouse",
    chip: "bg-emerald-500/15 text-emerald-800",
    chipDark: "bg-emerald-500/20 text-emerald-300",
    dot: "bg-emerald-500",
    ring: "ring-emerald-500",
  },
};

/** The consignment's type, as the office's sheet writes it (the owner's list, 2026-10-26). */
export const CARGO_TYPES = ["20GP", "40GP", "40HQ", "AIR", "LCL"] as const;
export const isCargoType = (v: unknown): v is (typeof CARGO_TYPES)[number] =>
  typeof v === "string" && (CARGO_TYPES as readonly string[]).includes(v);

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
