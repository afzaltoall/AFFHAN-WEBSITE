import "server-only";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { prisma } from "@/lib/prisma";
import { moqPhrase } from "@/lib/supplier-offer";
import type { ContactEntry, PhoneView } from "@/lib/suppliers";
import { SUGGESTED_STATUSES, rankPortalOffers, type SuggestedStatus } from "./portal-rank";

/**
 * New suppliers for an inquiry: the supplier portal's applications that answer it (portal-rank.ts), with the contact
 * each was sent with. Read on every request, unlike the old book's ten-minute index: an application should show in
 * the inquiry the moment it is sent. Only active accounts; a blocked supplier is suggested to nobody.
 */

export interface PortalSuggestion {
  offerId: string;
  /** Their page on New Suppliers (admins only), where the application is: /admin/new-suppliers/<id>/. */
  supplierId: string;
  /** Company on the application, else the contact name. */
  name: string;
  person: string;
  match: "product" | "similar";
  /** What they applied to supply. */
  productName: string;
  shared: string[];
  status: SuggestedStatus;
  /** "1,000 pieces". */
  moq: string;
  appliedAt: string;
  phones: PhoneView[];
  handles: ContactEntry[];
}

/** Applications read per inquiry: years of a portal's worth; the newest first should it ever be reached. */
const READ = 5000;

export async function portalSuggestionsFor(inquiry: { productId: number | null; productName: string }, limit = 10): Promise<PortalSuggestion[]> {
  let offers;
  try {
    offers = await prisma.supplierOffer.findMany({
      where: { status: { in: [...SUGGESTED_STATUSES] }, supplier: { status: "ACTIVE" } },
      orderBy: { createdAt: "desc" },
      take: READ,
      select: {
        id: true, supplierId: true, productId: true, productName: true, status: true, moq: true, moqUnit: true, createdAt: true,
        contactName: true, companyName: true, mobile: true, wechatId: true,
      },
    });
  } catch (error) {
    // The old book's suggestions must not be lost to the portal's: its kind only, never a contact.
    console.error("Portal supplier matches failed:", error instanceof Error ? error.name : "unknown");
    return [];
  }
  const picks = rankPortalOffers(inquiry, offers.map((o) => ({ ...o, status: o.status as SuggestedStatus })), limit);
  return picks.map(({ offer: o, match, shared }) => ({
    offerId: o.id,
    supplierId: o.supplierId,
    name: o.companyName.trim() || o.contactName.trim() || "Supplier",
    person: o.contactName.trim(),
    match,
    productName: o.productName,
    shared,
    status: o.status,
    moq: moqPhrase(o.moq, o.moqUnit),
    appliedAt: o.createdAt.toISOString(),
    phones: o.mobile
      ? [{ value: parsePhoneNumberFromString(o.mobile)?.formatInternational() ?? o.mobile, label: null, tags: [], e164: o.mobile, assumed: false, incomplete: false }]
      : [],
    handles: o.wechatId ? [{ value: o.wechatId, label: "WeChat ID", tags: [] }] : [],
  }));
}
