import "server-only";
import { contentWordsOf } from "./match";

/**
 * Which of the supplier portal's applications answer an inquiry (the owner, 2026-10-23: "a supplier applied for the
 * product a customer ordered, but the new supplier is not showing in the inquiry"). Kept apart from the database
 * (portal.ts reads the rows), so the rules can be tested as they are.
 *
 *   product   the application is for the inquired product itself: the same catalogue product, or, for a supplier's
 *             own product or a link since gone, exactly the same title
 *   similar   a different product sharing at least two of the inquired title's content words ("soccer" and "goal"),
 *             or its only one when either title has just one; the words of contentWordsOf, so the "With Carry Bag"
 *             a product comes with never makes a bag supplier similar
 *
 * One suggestion per supplier, their best application: the product itself before a similar one, more shared words,
 * accepted before reviewing before new, then the newest.
 */

/** Applications still on offer: open, or accepted. "Not selected" and withdrawn ones are suggested to nobody. */
export const SUGGESTED_STATUSES = ["NEW", "REVIEWING", "ACCEPTED"] as const;
export type SuggestedStatus = (typeof SUGGESTED_STATUSES)[number];

export interface PortalOffer {
  id: string;
  supplierId: string;
  productId: number | null;
  productName: string;
  status: SuggestedStatus;
  createdAt: Date;
}

export interface PortalPick<T extends PortalOffer> {
  offer: T;
  match: "product" | "similar";
  /** For a similar product, the content words it shares with the inquiry. */
  shared: string[];
}

const STATUS_RANK: Record<SuggestedStatus, number> = { ACCEPTED: 0, REVIEWING: 1, NEW: 2 };

const sameTitle = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

function order<T extends PortalOffer>(a: PortalPick<T>, b: PortalPick<T>): number {
  return (
    (a.match === b.match ? 0 : a.match === "product" ? -1 : 1) ||
    b.shared.length - a.shared.length ||
    STATUS_RANK[a.offer.status] - STATUS_RANK[b.offer.status] ||
    b.offer.createdAt.getTime() - a.offer.createdAt.getTime() ||
    a.offer.id.localeCompare(b.offer.id)
  );
}

export function rankPortalOffers<T extends PortalOffer>(
  inquiry: { productId: number | null; productName: string },
  offers: T[],
  limit = 10,
): PortalPick<T>[] {
  const title = sameTitle(inquiry.productName);
  const asked = new Set(contentWordsOf(inquiry.productName));
  const best = new Map<string, PortalPick<T>>();
  for (const offer of offers) {
    const product = (inquiry.productId !== null && offer.productId === inquiry.productId) || (title !== "" && sameTitle(offer.productName) === title);
    let shared: string[] = [];
    if (!product) {
      const theirs = contentWordsOf(offer.productName);
      shared = theirs.filter((w) => asked.has(w));
      const need = Math.min(2, asked.size, theirs.length);
      if (need === 0 || shared.length < need) continue;
    }
    const pick: PortalPick<T> = { offer, match: product ? "product" : "similar", shared };
    const held = best.get(offer.supplierId);
    if (!held || order(pick, held) < 0) best.set(offer.supplierId, pick);
  }
  return [...best.values()].sort(order).slice(0, limit);
}
