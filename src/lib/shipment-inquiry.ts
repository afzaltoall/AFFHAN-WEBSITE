/**
 * The freight quote request from /shipping/: its vocabulary, and the one
 * validation both ends run.
 *
 * Shared on purpose. The form checks as the customer fills it in and the API
 * checks again on arrival, and two hand-written copies of "what counts as
 * valid" drift apart — an API refusing what the form let through is the worst
 * of both. Nothing here is browser- or Node-only: libphonenumber (via
 * lib/phone.ts) runs in either.
 *
 * The fields are the ones on the freight CRM's enquiry screen that a customer
 * can answer. Team, handlers, agent and shipment status are staff's to set
 * once the request has arrived, so they have no place on the form.
 */

import { COUNTRIES } from "@/lib/countries";
import { isValidMobileE164 } from "@/lib/phone";

export const COMMODITY_TYPES = [
  { value: "GENERAL_CARGO", label: "General Cargo" },
  { value: "HAZARDOUS", label: "Hazardous" },
  { value: "PERISHABLE", label: "Perishable" },
  { value: "FRAGILE", label: "Fragile" },
  { value: "OTHER", label: "Other" },
] as const;

export const MODES = [
  { value: "SEA", label: "Sea" },
  { value: "AIR", label: "Air" },
] as const;

/** The Incoterms the CRM offers, with the name a customer will recognise. */
export const TERMS = [
  { value: "EXW", label: "EXW", name: "Ex Works" },
  { value: "FOB", label: "FOB", name: "Free On Board" },
  { value: "CIF", label: "CIF", name: "Cost, Insurance & Freight" },
  { value: "DDP", label: "DDP", name: "Delivered Duty Paid" },
  { value: "OTHER", label: "Other", name: "Something else" },
] as const;

/**
 * FCL and LCL move by sea and Air Freight is the only way to move by air, so
 * each method belongs to one mode. The form offers only the methods of the
 * mode chosen, and validation refuses a mismatched pair from anyone who posts
 * past the form.
 */
export const METHODS = [
  { value: "FCL", label: "FCL", name: "Full Container Load", mode: "SEA" },
  { value: "LCL", label: "LCL", name: "Less than Container Load", mode: "SEA" },
  { value: "AIR_FREIGHT", label: "Air Freight", name: "Airport to airport", mode: "AIR" },
] as const;

export type CommodityType = (typeof COMMODITY_TYPES)[number]["value"];
export type ShipmentMode = (typeof MODES)[number]["value"];
export type ShipmentTerms = (typeof TERMS)[number]["value"];
export type ShipmentMethod = (typeof METHODS)[number]["value"];

export const methodsFor = (mode: string) => METHODS.filter((m) => m.mode === mode);

const labelOf = (list: readonly { value: string; label: string }[], value: string) =>
  list.find((x) => x.value === value)?.label ?? value;

export const commodityTypeLabel = (v: string) => labelOf(COMMODITY_TYPES, v);
export const modeLabel = (v: string) => labelOf(MODES, v);
export const termsLabel = (v: string) => labelOf(TERMS, v);
export const methodLabel = (v: string) => labelOf(METHODS, v);
export const termsName = (v: string) => TERMS.find((t) => t.value === v)?.name ?? "";
export const methodName = (v: string) => METHODS.find((m) => m.value === v)?.name ?? "";

/**
 * Length caps, and the numeric ranges the columns can hold. cbm is
 * DECIMAL(10,3) and weightKg DECIMAL(12,2), so a value past these would be
 * refused by Postgres anyway; refusing it here says why.
 */
export const LIMITS = {
  customerName: 120,
  email: 200,
  commodity: 120,
  port: 80,
  notes: 2000,
  cbmMax: 9_999_999.999,
  weightMax: 9_999_999_999.99,
  cartonsMax: 1_000_000,
} as const;

/** What the form posts. Numbers arrive as the strings the inputs hold. */
export interface ShipmentInquiryInput {
  customerName: string;
  /** With its dial code: "+91 9876543210". */
  phone: string;
  email: string;
  country: string;
  commodity: string;
  commodityType: string;
  mode: string;
  portOfLoading: string;
  portOfDischarge: string;
  terms: string;
  cbm: string;
  cartonBoxes: string;
  weightKg: string;
  method: string;
  notes: string;
}

export type ShipmentField = keyof ShipmentInquiryInput;
export type FieldErrors = Partial<Record<ShipmentField, string>>;

/** A request that passed: trimmed, capped, typed, ready to store. */
export interface CleanShipmentInquiry {
  customerName: string;
  phone: string;
  email: string | null;
  country: string;
  commodity: string;
  commodityType: CommodityType;
  mode: ShipmentMode;
  portOfLoading: string;
  portOfDischarge: string;
  terms: ShipmentTerms;
  /** Decimal as a plain string, so no binary rounding happens on the way in. */
  cbm: string;
  cartonBoxes: number | null;
  weightKg: string;
  method: ShipmentMethod;
  notes: string | null;
}

// The rule /contact/ applies, so a customer is held to one standard everywhere.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const oneOf = <T extends string>(list: readonly { value: T }[], v: unknown): T | null =>
  (list.find((x) => x.value === v)?.value ?? null) as T | null;

/**
 * A positive decimal with at most `places` digits after the point, no larger
 * than `max`. Returns it normalised ("068.50" -> "68.5"), or null.
 *
 * Digits and one point only. A comma is refused rather than guessed at: it is
 * a thousands separator in "6,500" and a decimal point in "6,5", and reading
 * the wrong one would quote a shipment a thousand times the size.
 */
function decimal(v: unknown, places: number, max: number): string | null {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > max) return null;
  return String(n);
}

export function validateShipmentInquiry(raw: Partial<Record<ShipmentField, unknown>>):
  | { ok: true; value: CleanShipmentInquiry }
  | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const customerName = text(raw.customerName, LIMITS.customerName);
  if (!customerName) errors.customerName = "Enter your company or your own name.";

  // Kept in the "+91 9876543210" shape /contact/ stores; validated without
  // the spaces, as the E.164 number it is.
  const phone = text(raw.phone, 32);
  if (!phone) errors.phone = "Enter a mobile number.";
  else if (!isValidMobileE164(phone.replace(/\s+/g, ""))) {
    errors.phone = "Enter a valid mobile number for the country code you picked.";
  }

  const email = text(raw.email, LIMITS.email);
  if (email && !EMAIL_RE.test(email)) errors.email = "That email address doesn't look complete.";

  const country = text(raw.country, 80);
  if (!country) errors.country = "Pick the country this shipment is for.";
  else if (!COUNTRIES.some((c) => c.name === country)) errors.country = "Pick a country from the list.";

  const commodity = text(raw.commodity, LIMITS.commodity);
  if (!commodity) errors.commodity = "Say what the goods are.";

  const commodityType = oneOf(COMMODITY_TYPES, raw.commodityType);
  if (!commodityType) errors.commodityType = "Choose the type of cargo.";

  const mode = oneOf(MODES, raw.mode);
  if (!mode) errors.mode = "Choose sea or air.";

  const portOfLoading = text(raw.portOfLoading, LIMITS.port);
  if (!portOfLoading) errors.portOfLoading = "Enter the port the goods leave from.";

  const portOfDischarge = text(raw.portOfDischarge, LIMITS.port);
  if (!portOfDischarge) errors.portOfDischarge = "Enter the port the goods arrive at.";

  const terms = oneOf(TERMS, raw.terms);
  if (!terms) errors.terms = "Choose the terms of sale.";

  const cbm = decimal(raw.cbm, 3, LIMITS.cbmMax);
  if (!cbm) errors.cbm = "Enter the volume in cubic metres, like 68 or 12.5.";

  const weightKg = decimal(raw.weightKg, 2, LIMITS.weightMax);
  if (!weightKg) errors.weightKg = "Enter the weight in kilograms, like 6500.";

  let cartonBoxes: number | null = null;
  const cartonsRaw = typeof raw.cartonBoxes === "number" ? String(raw.cartonBoxes) : text(raw.cartonBoxes, 12);
  if (cartonsRaw) {
    const n = /^\d+$/.test(cartonsRaw) ? Number(cartonsRaw) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > LIMITS.cartonsMax) errors.cartonBoxes = "Enter a whole number of cartons.";
    else cartonBoxes = n;
  }

  const method = oneOf(METHODS, raw.method);
  if (!method) errors.method = mode ? "Choose how it ships." : "Choose sea or air first.";
  else if (mode && !methodsFor(mode).some((m) => m.value === method)) {
    errors.method = mode === "AIR" ? "Air shipments go as Air Freight." : "Sea shipments go as FCL or LCL.";
  }

  // Newlines are the point of a notes box, so this one keeps them.
  const notes = typeof raw.notes === "string" ? raw.notes.trim().slice(0, LIMITS.notes) : "";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      customerName,
      phone,
      email: email || null,
      country,
      commodity,
      commodityType: commodityType!,
      mode: mode!,
      portOfLoading,
      portOfDischarge,
      terms: terms!,
      cbm: cbm!,
      cartonBoxes,
      weightKg: weightKg!,
      method: method!,
      notes: notes || null,
    },
  };
}

/** "Sea · FCL · Shanghai → Chennai", for list rows and cards. */
export function routeSummary(s: { mode: string; method: string; portOfLoading: string; portOfDischarge: string }) {
  return `${modeLabel(s.mode)} · ${methodLabel(s.method)} · ${s.portOfLoading} → ${s.portOfDischarge}`;
}

/**
 * One row of /api/account/shipments: a request as its sender sees it again,
 * which is what they typed plus the reference and when. Read by the account's
 * My Shipments page, and by the /shipping/ form, which shows the latest one
 * again after a reload.
 */
export interface AccountShipment {
  referenceNo: string;
  createdAt: string;
  customerName: string;
  phone: string;
  email: string | null;
  country: string;
  commodity: string;
  commodityType: string;
  mode: string;
  method: string;
  portOfLoading: string;
  portOfDischarge: string;
  terms: string;
  cbm: string;
  weightKg: string;
  cartonBoxes: number | null;
  notes: string | null;
}

/**
 * A sent request as the one sentence /shipping/ reads it back in:
 * "Sea freight, FCL — 68 m³ and 6,500 kg of LED panel lights, Shanghai to
 * Chennai, on FOB terms." Plain text, for a request that is complete; the
 * form's own RequestSentence draws the same words with blanks while a draft is
 * still being filled in.
 */
export function shipmentSentence(s: {
  mode: string; method: string; cbm: string | number; weightKg: string | number;
  commodity: string; portOfLoading: string; portOfDischarge: string; terms: string;
}) {
  const fig = (v: string | number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
  const how = s.mode === "SEA" ? `Sea freight, ${methodLabel(s.method)}` : "Air freight";
  const terms = s.terms === "OTHER" ? "on other terms" : `on ${termsLabel(s.terms)} terms`;
  return `${how} — ${fig(s.cbm)} m³ and ${fig(s.weightKg)} kg of ${s.commodity}, ${s.portOfLoading} to ${s.portOfDischarge}, ${terms}.`;
}

/** Figures as staff read them: "68 m³ · 6,500 kg · 120 cartons". */
export function loadSummary(s: { cbm: string | number; weightKg: string | number; cartonBoxes: number | null }) {
  const fmt = (v: string | number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
  const parts = [`${fmt(s.cbm)} m³`, `${fmt(s.weightKg)} kg`];
  if (s.cartonBoxes) parts.push(`${s.cartonBoxes.toLocaleString("en-IN")} carton${s.cartonBoxes === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
