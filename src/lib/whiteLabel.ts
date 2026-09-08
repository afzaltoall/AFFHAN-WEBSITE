// ---------------------------------------------------------------------------
// White-labelling: the catalogue is AFFHAN's, and nothing customer-facing may
// name the supplier it came from.
//
// This is the single source of truth for "what counts as a supplier name", used
// by the ingest guards, the API response shaping, and the build-time test. It
// exists because the rule kept being re-remembered rather than enforced: EPROLO
// reached production in category ids (?categoryId=EPROLO-L2-1237), in every S3
// image path (products/eprolo/...), and in 724 product descriptions.
//
// Add a supplier here the day it is integrated, before its first ingest, and
// every guard picks it up at once.
// ---------------------------------------------------------------------------

/// Names that must never appear in anything a browser can see.
///
/// "cj" is deliberately absent: it is two letters and matches innocent words
/// ("cjk", and any sku containing the pair). CJ leaks nothing today — its
/// category ids are plain UUIDs and its image paths carry no brand — so the
/// cost of a false positive here outweighs a risk that does not exist. Revisit
/// only with a pattern precise enough not to fire on ordinary text.
export const SUPPLIER_NAMES = ["eprolo", "cjdropshipping", "aliexpress", "alibaba"] as const;

const SUPPLIER_RE = new RegExp(SUPPLIER_NAMES.join("|"), "i");

export function containsSupplierName(value: string | null | undefined): boolean {
  return !!value && SUPPLIER_RE.test(value);
}

/// Throws rather than returns. A storage key or public id carrying a supplier
/// name is not something to log and continue past — it is written once and then
/// lives in URLs, caches and search indexes indefinitely.
export function assertNeutral(value: string, what = "value"): string {
  if (containsSupplierName(value)) {
    throw new Error(
      `white-label violation: ${what} contains a supplier name -> ${value}\n` +
      `Nothing customer-facing may name a supplier. See src/lib/whiteLabel.ts.`
    );
  }
  return value;
}

/// Fields that may never be serialised to a public API response, regardless of
/// which route builds it. Internal tracking keeps them in the database and in
/// admin-only views.
export const PRIVATE_PRODUCT_FIELDS = [
  "supplierSource",
  "cjPid",
  "sku",
] as const;

/// Strips the private fields from an object before it is sent to a browser.
/// Deliberately returns a new object: mutating a Prisma result risks the change
/// leaking into something else holding the same reference.
export function stripPrivateFields<T extends Record<string, unknown>>(row: T): Omit<T, (typeof PRIVATE_PRODUCT_FIELDS)[number]> {
  const out = { ...row };
  for (const f of PRIVATE_PRODUCT_FIELDS) delete (out as Record<string, unknown>)[f];
  return out as Omit<T, (typeof PRIVATE_PRODUCT_FIELDS)[number]>;
}
