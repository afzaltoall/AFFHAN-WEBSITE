// Strict phone validation for the enquiry modal.
//
// We use libphonenumber-js's FULL ("max") metadata so we can inspect the number
// TYPE, not just its length. An enquiry needs a reachable MOBILE (for the
// callback / WhatsApp), so we require the number to be a valid MOBILE (or the
// combined FIXED_LINE_OR_MOBILE that many countries report) for the SELECTED
// country. This also catches the common "wrong country, wrong number" mistake:
// e.g. an Indian mobile typed under +86 resolves to a Chinese FIXED_LINE, which
// we reject — so the form correctly shows it as invalid.
import {
  isValidPhoneNumber,
  parsePhoneNumber,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
} from "libphonenumber-js/max";

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

/**
 * The same check as isValidMobile, for a number already in E.164 form.
 *
 * The signup route receives one string ("+919876543210") rather than a country
 * and a national part, and the server has to repeat the check the form makes —
 * a form is a convenience, not a guarantee, and anyone can POST past it.
 */
export function isValidMobileE164(e164: string): boolean {
  const value = (e164 || "").trim();
  if (!value.startsWith("+")) return false;
  try {
    if (!isValidPhoneNumber(value)) return false;
    const type = parsePhoneNumber(value)?.getType();
    return type !== undefined && ACCEPTED_TYPES.has(type);
  } catch {
    return false;
  }
}

/**
 * An E.164 number ("+919876543210") as the three pieces a dial-code picker and
 * a digits-only field hold: { iso: "in", dial: "+91", national: "9876543210" }.
 *
 * For prefilling a form from a signed-in account. Null for anything that does
 * not parse, so the prefill simply does not happen rather than guessing.
 */
export function splitE164(e164: string): { iso: string; dial: string; national: string } | null {
  const value = (e164 || "").trim();
  if (!value.startsWith("+")) return null;
  try {
    const parsed = parsePhoneNumber(value);
    if (!parsed?.country) return null;
    return { iso: parsed.country.toLowerCase(), dial: `+${parsed.countryCallingCode}`, national: parsed.nationalNumber };
  } catch {
    return null;
  }
}

/** What readContactPhone answers: the number in E.164, or why it cannot be one, in words to show as they are. */
export type ContactPhone = { ok: true; e164: string } | { ok: false; error: string };

/**
 * A customer's mobile number as they typed or sent it: the country code and the digits ("+91 98765 43210").
 *
 * Checked the way password sign-up checks one (isValidMobileE164: a real mobile for its country, by the full
 * metadata) and put in E.164. Spaces, dashes, dots and brackets are dropped and "00" in front is read as "+";
 * anything else is refused with a sentence that says what to fix. The same words reach the phone dialog, which
 * runs this before it sends, and the app, which shows the server's (lib/contact-phone.ts).
 */
export function readContactPhone(input: unknown): ContactPhone {
  const typed = typeof input === "string" ? input.trim() : "";
  if (!typed) return { ok: false, error: "Enter your mobile number." };
  // Far beyond any real number (E.164 is 15 digits), so nothing long reaches the parser.
  if (typed.length > 32) return { ok: false, error: "That number is too long. Check the digits." };
  let s = typed.replace(/[\s().-]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (!s.startsWith("+")) return { ok: false, error: "Start with the country code, like +91 98765 43210." };
  if (!/^\+\d+$/.test(s)) return { ok: false, error: "Use only digits after the country code." };
  switch (validatePhoneNumberLength(s)) {
    case "INVALID_COUNTRY":
      return { ok: false, error: "That country code isn't right. Check the code after the +." };
    case "TOO_SHORT":
      return { ok: false, error: "That number is too short. Check the digits." };
    case "TOO_LONG":
      return { ok: false, error: "That number is too long. Check the digits." };
  }
  if (isValidMobileE164(s)) return { ok: true, e164: parsePhoneNumber(s).number };
  // A real number that no one can WhatsApp, an office landline say: a different fix, so a different sentence.
  if (parsePhoneNumberFromString(s)?.isValid()) {
    return { ok: false, error: "That looks like a landline. Enter a mobile number, so we can call or WhatsApp you." };
  }
  return { ok: false, error: "That isn't a valid mobile number. Check the country code and the digits." };
}

/**
 * What a national field under a dial-code picker holds, as E.164: "098765 43210" under India is "+919876543210",
 * the trunk 0 and a repeated 91 read the way people mean them. Null when there are no digits. Whether it is a
 * real mobile is readContactPhone's question, not this one's.
 */
export function contactE164(national: string, countryIso: string): string | null {
  const digits = (national || "").replace(/\D/g, "");
  if (!digits) return null;
  try {
    return parsePhoneNumberFromString(digits, countryIso.toUpperCase() as never)?.number ?? null;
  } catch {
    return null;
  }
}
