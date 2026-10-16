import { z } from "zod";
import type { MobileUser, Prisma } from "@prisma/client";

/**
 * The customer's own details for the app: everything /api/mobile/auth/me has always sent, and the company and
 * address of the app's "Complete your profile" (the owner, 2026-10-16), with whether a password signs in too.
 * Older app builds read only the first few keys, so none is renamed or removed.
 */
export function profileOf(user: MobileUser) {
  return {
    id: user.id,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    authProvider: user.authProvider,
    profileImage: user.profileImage,
    emailVerified: user.emailVerified,
    accountStatus: user.accountStatus,
    createdAt: user.createdAt,
    /** A Google-only account has none; the app offers to set one (/api/web/auth/set-password/). */
    hasPassword: Boolean(user.passwordHash),
    companyName: user.companyName,
    address: {
      line1: user.addressLine1,
      line2: user.addressLine2,
      city: user.city,
      state: user.state,
      postalCode: user.postalCode,
      country: user.country,
    },
  };
}

export type Profile = ReturnType<typeof profileOf>;

const NAME_MAX = 80;

/** Letters, digits, spaces and dashes, as postal codes are written (600013, SW1A 1AA, 12345-6789, K1A 0B6). */
const POSTAL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9 -]{0,18}[A-Za-z0-9])?$/;

/** Absent: left as it is. Null or blank: cleared. Text: trimmed and saved. */
const editable = (label: string, max: number) =>
  z
    .string({ error: `${label} must be text.` })
    .trim()
    .max(max, `${label} is too long (${max.toLocaleString("en-US")} characters at most).`)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

/**
 * What the app may change here: the name, the company, the address, any of them in one save. Not the email (the
 * website's own form, with its uniqueness answer) and not the phone (/api/mobile/account/phone/, with its check
 * and its limit). Anything else in the body is ignored.
 */
export const profileInput = z.object({
  firstName: z
    .string({ error: "First name must be text." })
    .trim()
    .min(1, "Enter your first name.")
    .max(NAME_MAX, "That name is too long.")
    .optional(),
  lastName: editable("Last name", NAME_MAX),
  companyName: editable("Company name", 200),
  address: z
    .object({
      line1: editable("Address", 200),
      line2: editable("Address line 2", 200),
      city: editable("City", 100),
      state: editable("State or region", 100),
      postalCode: editable("Postal code", 20).refine((v) => v == null || POSTAL_RE.test(v), "Enter a valid postal code."),
      country: editable("Country", 100),
    })
    .optional(),
});

export type ProfileInput = z.infer<typeof profileInput>;

/** The first problem as the answer's sentence, and each field's own, as describeInquiryProblems does. */
export function describeProfileProblems(error: z.ZodError): { error: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !(key in fields)) fields[key] = issue.message;
  }
  return { error: error.issues[0]?.message ?? "Check your details.", fields };
}

/** The address on one line, for the account's change trail: "12 Main St, Chennai, 600013, India". */
export function addressLine(a: { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postalCode?: string | null; country?: string | null }): string | null {
  const parts = [a.line1, a.line2, a.city, a.state, a.postalCode, a.country].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(", ") : null;
}

/**
 * The update for `input` on `user`, or a reason it cannot be made. The name is kept whole from its halves, as the
 * website's form keeps it; a last name alone is refused on an account that has no first name to go before it.
 */
export function profileUpdate(user: MobileUser, input: ProfileInput): { ok: true; data: Prisma.MobileUserUpdateInput } | { ok: false; error: string } {
  const data: Prisma.MobileUserUpdateInput = {};
  if (input.firstName !== undefined || input.lastName !== undefined) {
    const first = input.firstName ?? user.firstName;
    if (!first) return { ok: false, error: "Enter your first name." };
    const last = input.lastName !== undefined ? input.lastName : user.lastName;
    data.firstName = first;
    data.lastName = last;
    data.name = [first, last].filter(Boolean).join(" ");
  }
  if (input.companyName !== undefined) data.companyName = input.companyName;
  const a = input.address;
  if (a) {
    if (a.line1 !== undefined) data.addressLine1 = a.line1;
    if (a.line2 !== undefined) data.addressLine2 = a.line2;
    if (a.city !== undefined) data.city = a.city;
    if (a.state !== undefined) data.state = a.state;
    if (a.postalCode !== undefined) data.postalCode = a.postalCode;
    if (a.country !== undefined) data.country = a.country;
  }
  return { ok: true, data };
}
