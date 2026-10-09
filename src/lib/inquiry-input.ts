import { z } from "zod";

/**
 * What a quote request to /api/inquiry may carry (security audit 2026-10-08,
 * M6).
 *
 * The route used to check only that five fields were present and then handed
 * the rest to the database as it came: no length limit on any text, the
 * quantity read with parseInt (so "12abc" was 12, and a number too big for the
 * column failed in Prisma), any string at all as a phone. This is the shape it
 * accepts now. The limits sit far above anything the quote form produces, so
 * nobody using the form meets them; they are for requests that did not come
 * from it.
 *
 * Kept in step with the form (InquiryModal): the email rule is the form's
 * own, and the phone is checked for its characters and number of digits only.
 * The form has already checked the number against the chosen country with
 * libphonenumber, and a national number typed with its trunk 0
 * ("+44 07911 123456") passes there but would fail a strict E.164 check here.
 *
 * Keys the schema does not name are dropped, so a body cannot set userId,
 * status or assignedToId.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?\d[\d\s().-]*$/;

/** Trimmed text of at most `max` characters; `required` is said when it is missing or blank. */
const text = (label: string, max: number) =>
  z
    .string({ error: (issue) => (issue.input === undefined || issue.input === null ? `${label} is required.` : `${label} must be text.`) })
    .trim()
    .max(max, `${label} is too long (${max.toLocaleString("en-US")} characters at most).`);

const required = (label: string, max: number, blank: string) => text(label, max).min(1, blank);

/** Text that may be left out; empty is stored as nothing. */
const optional = (label: string, max: number) => text(label, max).nullish().transform((v) => v || null);

/** A whole number from `min` to `max`, sent as a number or as digits. */
const whole = (label: string, min: number, max: number) =>
  z
    .union([z.number(), z.string().trim().regex(/^\d+$/).transform(Number)], { error: `${label} must be a whole number.` })
    .pipe(
      z
        .number()
        .int(`${label} must be a whole number.`)
        .min(min, `${label} must be at least ${min.toLocaleString("en-US")}.`)
        .max(max, `${label} must be at most ${max.toLocaleString("en-US")}.`)
    );

export const inquiryInput = z.object({
  /** Product.id. Optional: a request can name a product the catalogue no longer lists. */
  productId: whole("Product", 1, 2_147_483_647)
    .nullish()
    .transform((v) => v ?? null),
  productName: required("Product name", 500, "Product name is required."),
  quantity: whole("Quantity", 1, 10_000_000),
  customerName: required("Name", 200, "Enter your name."),
  companyName: optional("Company name", 200),
  email: optional("Email", 254).refine((v) => v === null || EMAIL_RE.test(v), "Enter a valid email address."),
  country: required("Country", 100, "Choose your country."),
  // 7 to 16 digits, country code included: the shortest complete
  // international number is 7 (+290 and four digits), the longest E.164
  // allows is 15, and one more is room for a trunk 0 typed after the code.
  phone: required("Phone number", 40, "Enter your phone number.").refine((v) => {
    const digits = v.replace(/\D/g, "").length;
    return PHONE_RE.test(v) && digits >= 7 && digits <= 16;
  }, "Enter a valid phone number."),
  message: optional("Message", 10_000),
});

export type InquiryInput = z.infer<typeof inquiryInput>;

/**
 * A refusal in the customer's words: the first problem as `error`, and one
 * line per field as `fields`. A body that is not an object at all has no
 * field to name.
 */
export function describeInquiryProblems(error: z.ZodError): { error: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fields)) fields[key] = issue.message;
  }
  const first = Object.values(fields)[0];
  return { error: first ?? "Send the quote request as a JSON object.", fields };
}
