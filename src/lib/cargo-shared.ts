/**
 * Cargo tracking's words and rules, for both sides of the wall (the owner, 2026-10-24): the stages a consignment
 * goes through and what each is called, its container types, how a number is matched, and how a day is written. No
 * imports, so the browser, the server and the tests read the same.
 *
 * The stages are the owner's own list (2026-10-26, "Shipping Requirements"), in the order cargo meets them: loaded,
 * on the vessel, at sea, discharged at the port of discharge, through customs, in the warehouse. They carry no
 * colour: a stage is told by its name and its place among the six (the owner, 2026-10-26, of the dot each once had:
 * "colour dots feel like AI").
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

/** Each stage's name, and the words of an update posted for it unless the assigner writes their own. */
export const CARGO_STATUS_META: Record<CargoStatus, { label: string; event: string }> = {
  CARGO_LOADED: { label: "Cargo loaded", event: "Cargo loaded" },
  VESSEL_LOADING: { label: "Vessel loading", event: "Loading on the vessel" },
  VESSEL_SAILING: { label: "Vessel sailing", event: "Vessel sailing" },
  VESSEL_DISCHARGED: { label: "Vessel discharged", event: "Discharged at the port of discharge" },
  IN_CUSTOMS: { label: "In customs clearance", event: "In customs clearance" },
  IN_WAREHOUSE: { label: "In warehouse", event: "In warehouse" },
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

/**
 * What the public tracker answers with: the number, the stage, ETD and ETA (the owner, 2026-10-26: shown to the
 * customer), and the timeline, each change once. Nothing else of the sheet: never the customer, the ports, the type,
 * who changed what, or when the row was last touched.
 */
export interface CargoTrack {
  reference: string;
  status: CargoStatus;
  etd: string | null;
  eta: string | null;
  events: { date: string; name: string; status: CargoStatus }[];
}

/** Two updates' words, the same but for case and spacing. */
export const sameWords = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

/** A day of the customer's timeline: its date, the updates' names in the order they were posted, and its stage. */
export interface TrackDay {
  date: string;
  names: string[];
  status: CargoStatus;
}

/**
 * The customer's timeline, a row a day (the owner, 2026-10-26, of two updates on one date, "loaded" and "no", each
 * with the date and status again: "two times kaatura mari eruku ... event name old new katanum and status edhu
 * mathunomo adhu matu katanum"). Each date once; under it every name posted that day, the old ones first, each once;
 * and only the status the day ended on. `events` come oldest first, as /api/track answers.
 */
export function trackDays(events: CargoTrack["events"]): TrackDay[] {
  const days: TrackDay[] = [];
  for (const e of events) {
    const day = days[days.length - 1];
    if (day && day.date === e.date) {
      if (!day.names.some((n) => sameWords(n, e.name))) day.names.push(e.name);
      day.status = e.status;
    } else days.push({ date: e.date, names: [e.name], status: e.status });
  }
  return days;
}

/** "24-Oct-2026", the way a carrier's tracker writes an event's date (the owner's reference, 2026-10-26). */
export function fmtTrackDay(day: string | null | undefined): string {
  if (!day) return "";
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return "";
  const month = d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return `${String(d.getUTCDate()).padStart(2, "0")}-${month}-${d.getUTCFullYear()}`;
}
