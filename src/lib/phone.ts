// Strict phone validation for the enquiry modal.
//
// We use libphonenumber-js's FULL ("max") metadata so we can inspect the number
// TYPE, not just its length. An enquiry needs a reachable MOBILE (for the
// callback / WhatsApp), so we require the number to be a valid MOBILE (or the
// combined FIXED_LINE_OR_MOBILE that many countries report) for the SELECTED
// country. This also catches the common "wrong country, wrong number" mistake:
// e.g. an Indian mobile typed under +86 resolves to a Chinese FIXED_LINE, which
// we reject — so the form correctly shows it as invalid.
import { isValidPhoneNumber, parsePhoneNumber } from "libphonenumber-js/max";

const ACCEPTED_TYPES = new Set(["MOBILE", "FIXED_LINE_OR_MOBILE"]);

/** Is `national` a valid MOBILE number for ISO country `countryIso` (e.g. "IN")? */
export function isValidMobile(national: string, countryIso: string): boolean {
  const digits = (national || "").replace(/\D/g, "");
  if (!digits) return false;
  const iso = (countryIso || "").toUpperCase();
  try {
    if (!isValidPhoneNumber(digits, iso as never)) return false;
    const type = parsePhoneNumber(digits, iso as never)?.getType();
    return type !== undefined && ACCEPTED_TYPES.has(type);
  } catch {
    return false;
  }
}

// Dialing code (e.g. "+91") -> ISO country, for forms that only track the code.
export const DIAL_TO_ISO: Record<string, string> = {
  "+91": "IN", "+86": "CN", "+44": "GB", "+65": "SG", "+60": "MY",
  "+971": "AE", "+1": "US", "+61": "AU", "+49": "DE", "+33": "FR",
};
