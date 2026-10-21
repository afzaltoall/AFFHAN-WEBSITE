import { readContactPhone } from "@/lib/phone";

// ---------------------------------------------------------------------------
// The supplier portal's words and rules, in one place for the routes, the
// supplier's pages and the admin board (the owner, 2026-10-21). No database
// and nothing server-only, so the forms can check as the supplier types and
// say the same sentence the server would.
// ---------------------------------------------------------------------------

/** An application's life: sent, looked at, decided. WITHDRAWN is the supplier's own; the rest are the team's. */
export const OFFER_STATUSES = ["NEW", "REVIEWING", "ACCEPTED", "REJECTED", "WITHDRAWN"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export function isOfferStatus(value: unknown): value is OfferStatus {
  return typeof value === "string" && (OFFER_STATUSES as readonly string[]).includes(value);
}

/** What the supplier reads. */
export const SUPPLIER_STATUS_LABEL: Record<OfferStatus, string> = {
  NEW: "Sent",
  REVIEWING: "Being reviewed",
  ACCEPTED: "Accepted",
  REJECTED: "Not selected",
  WITHDRAWN: "Withdrawn",
};

/** What the team reads. */
export const TEAM_STATUS_LABEL: Record<OfferStatus, string> = {
  NEW: "New",
  REVIEWING: "Reviewing",
  ACCEPTED: "Accepted",
  REJECTED: "Not selected",
  WITHDRAWN: "Withdrawn",
};

/** The team's choices: WITHDRAWN is the supplier's to make, never set from the console. */
export const TEAM_STATUSES: readonly OfferStatus[] = ["NEW", "REVIEWING", "ACCEPTED", "REJECTED"];

/**
 * Still open. A supplier has one open application per catalogue product at a
 * time (a second would be the same offer twice), and can withdraw an open one.
 */
export const OPEN_STATUSES: readonly OfferStatus[] = ["NEW", "REVIEWING"];

export const MOQ_UNITS = ["pieces", "sets", "pairs", "boxes", "cartons", "dozens", "kg", "meters"] as const;
export type MoqUnit = (typeof MOQ_UNITS)[number];

/** Ten million of anything: more than any MOQ, small enough to stay a plain integer everywhere. */
export const MOQ_MAX = 10_000_000;
export const DETAILS_MIN = 10;
export const DETAILS_MAX = 3000;
export const PHOTOS_MAX = 5;
export const PRODUCT_NAME_MAX = 200;
export const REPLY_MAX = 2000;

/** Applications one account may send in a day: far beyond a real supplier's day, and held in the database. */
export const OFFERS_PER_DAY = 300;

/** The contact card on an account and on every application. */
export interface SupplierContact {
  name: string;
  companyName: string;
  /** E.164 */
  mobile: string;
  wechatId: string;
  companyAddress: string;
}

export type ReadResult<T> = { ok: true; value: T } | { ok: false; error: string; field: string };

const fail = (field: string, error: string): { ok: false; error: string; field: string } => ({ ok: false, error, field });
/** One line: trimmed, inner runs of space made one. */
const line = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
/** Several lines: trimmed, line breaks kept. */
const lines = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "");

/**
 * A new account: a name and a mobile, as a customer's sign-up asks (the owner, 2026-10-21: "same as user
 * login style"). The email and the password are the route's.
 */
export function readSignup(body: Record<string, unknown>): ReadResult<{ name: string; mobile: string }> {
  const name = line(body.name);
  if (!name) return fail("name", "Enter your name.");
  if (name.length > 100) return fail("name", "That name is too long.");
  const phone = readContactPhone(body.mobile);
  if (!phone.ok) return fail("mobile", phone.error);
  return { ok: true, value: { name, mobile: phone.e164 } };
}

type CompanyFields = Pick<SupplierContact, "companyName" | "wechatId" | "companyAddress">;

/** The company, the WeChat ID and the address: required on an application, optional on the profile. */
function readCompany(body: Record<string, unknown>, required: boolean): ReadResult<{ [K in keyof CompanyFields]: string | null }> {
  const companyName = line(body.companyName);
  if (companyName || required) {
    if (companyName.length < 2) return fail("companyName", "Enter your company's name.");
    if (companyName.length > 160) return fail("companyName", "That company name is too long.");
  }
  const wechatId = line(body.wechatId);
  if (!wechatId && required) return fail("wechatId", "Enter your WeChat ID.");
  if (wechatId.length > 60) return fail("wechatId", "That WeChat ID is too long.");
  const companyAddress = lines(body.companyAddress);
  if (companyAddress || required) {
    if (companyAddress.length < 5) return fail("companyAddress", "Enter your company's address.");
    if (companyAddress.length > 500) return fail("companyAddress", "That address is too long.");
  }
  return { ok: true, value: { companyName: companyName || null, wechatId: wechatId || null, companyAddress: companyAddress || null } };
}

/** The five contact fields on an application, every one required. */
export function readContact(body: Record<string, unknown>): ReadResult<SupplierContact> {
  const who = readSignup(body);
  if (!who.ok) return who;
  const company = readCompany(body, true);
  if (!company.ok) return company;
  return {
    ok: true,
    value: {
      name: who.value.name,
      mobile: who.value.mobile,
      companyName: company.value.companyName as string,
      wechatId: company.value.wechatId as string,
      companyAddress: company.value.companyAddress as string,
    },
  };
}

/** The profile page's save: the name and the mobile, and the company details if given (an empty one clears). */
export function readProfile(body: Record<string, unknown>): ReadResult<{
  name: string;
  mobile: string;
  companyName: string | null;
  wechatId: string | null;
  companyAddress: string | null;
}> {
  const who = readSignup(body);
  if (!who.ok) return who;
  const company = readCompany(body, false);
  if (!company.ok) return company;
  return { ok: true, value: { ...who.value, ...company.value } };
}

export interface OfferInput {
  /** A catalogue product, or null for one the supplier named themselves. */
  productId: number | null;
  /** The name they typed, when productId is null. */
  productName: string | null;
  moq: number;
  moqUnit: MoqUnit;
  details: string;
  photos: string[];
  contact: SupplierContact;
}

/**
 * An application as the form sends it. `isOurPhoto` says whether a picture is
 * one our upload route issued (lib/video-storage.ts, isSupplierPhotoUrl, on
 * the server; the form passes anything, as it only holds what it uploaded).
 */
export function readOffer(body: Record<string, unknown>, isOurPhoto: (url: string) => boolean): ReadResult<OfferInput> {
  let productId: number | null = null;
  let productName: string | null = null;
  if (body.productId !== null && body.productId !== undefined && body.productId !== "") {
    const id = Number(body.productId);
    if (!Number.isSafeInteger(id) || id < 1) return fail("productId", "That product could not be found.");
    productId = id;
  } else {
    productName = line(body.productName);
    if (productName.length < 2) return fail("productName", "Enter the product's name.");
    if (productName.length > PRODUCT_NAME_MAX) return fail("productName", "That product name is too long.");
  }

  const moqText = typeof body.moq === "number" ? String(body.moq) : line(body.moq).replace(/[,\s]/g, "");
  if (!moqText) return fail("moq", "Enter your minimum order quantity.");
  const moq = Number(moqText);
  if (!/^\d+$/.test(moqText) || !Number.isSafeInteger(moq) || moq < 1) {
    return fail("moq", "Enter the minimum order quantity as a whole number, like 500.");
  }
  if (moq > MOQ_MAX) return fail("moq", "That quantity is too large.");

  const unit = line(body.moqUnit) || "pieces";
  if (!(MOQ_UNITS as readonly string[]).includes(unit)) return fail("moqUnit", "Choose a unit for the quantity.");

  const details = lines(body.details);
  if (details.length < DETAILS_MIN) {
    return fail("details", "Tell us about the product: material, sizes, colours, packing.");
  }
  if (details.length > DETAILS_MAX) return fail("details", `Keep the details under ${DETAILS_MAX.toLocaleString("en-US")} characters.`);

  const rawPhotos = Array.isArray(body.photos) ? body.photos : [];
  if (rawPhotos.length > PHOTOS_MAX) return fail("photos", `Add up to ${PHOTOS_MAX} photos.`);
  const photos: string[] = [];
  for (const p of rawPhotos) {
    if (typeof p !== "string" || !isOurPhoto(p)) return fail("photos", "One of the photos did not upload. Remove it and add it again.");
    if (!photos.includes(p)) photos.push(p);
  }

  const contact = readContact(typeof body.contact === "object" && body.contact ? (body.contact as Record<string, unknown>) : {});
  if (!contact.ok) return contact;

  return { ok: true, value: { productId, productName, moq, moqUnit: unit as MoqUnit, details, photos, contact: contact.value } };
}

/** "500 pieces", "1 set": a quantity in the supplier's unit. */
export function moqPhrase(moq: number, unit: string): string {
  const singular: Record<string, string> = { pieces: "piece", sets: "set", pairs: "pair", boxes: "box", cartons: "carton", dozens: "dozen" };
  const word = moq === 1 ? singular[unit] ?? unit : unit;
  return `${moq.toLocaleString("en-US")} ${word}`;
}
