/**
 * How the staff and admin screens name a customer in a lead action or message (the owner, 2026-10-22). A customer's
 * first name can be anybody's, a member of staff's included ("Release Siddiq to the open pool?" read as if Siddiq
 * worked here), so a customer is always "customer <name>" with what they asked for: "customer Siddiq (O-neck T-Shirt
 * + 1 more)". Staff are always named after "by", "held by" or "taken by" (lib/lead-pool-rules.ts, staffWord).
 *
 * Before Take the pool may not show a name (lib/lead-pool.ts, listPool), so there the customer is their AFFHAN
 * number: "AFFHAN-0123 (O-neck T-Shirt)".
 *
 * No JSX and no imports, so the tests can import it as it is and both sides of the wall can use it.
 */

/** One request, as far as naming the customer goes: a product's name for a quote request, else what it is. */
export interface AskedItem {
  kind: "inquiry" | "contact" | "shipment";
  /** The product's name, for a quote request. Never a message's title, which is the sender's own name. */
  title?: string | null;
}

/** "O-neck T-Shirt + 1 more": their first product (else what their first request is), and how many more there are. */
export function askedFor(items: AskedItem[]): string {
  if (items.length === 0) return "";
  const product = items.find((i) => i.kind === "inquiry" && i.title?.trim())?.title?.trim();
  const first = product ?? (items[0].kind === "shipment" ? "Freight request" : items[0].kind === "contact" ? "Contact message" : "Quote request");
  const more = items.length - 1;
  return more > 0 ? `${first} + ${more} more` : first;
}

/** "customer Siddiq (O-neck T-Shirt + 1 more)", for the middle of a sentence; capitalized() starts one with it. */
export function customerLabel(name: string | null | undefined, items: AskedItem[]): string {
  const who = (name ?? "").trim();
  const asked = askedFor(items);
  return `${who ? `customer ${who}` : "this customer"}${asked ? ` (${asked})` : ""}`;
}

/** "AFFHAN-0123 (O-neck T-Shirt)": the pool's way, where nobody may see a name yet. */
export function poolLabel(code: string | null | undefined, items: AskedItem[]): string {
  const asked = askedFor(items);
  return `${code?.trim() || "this customer"}${asked ? ` (${asked})` : ""}`;
}

export const capitalized = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
