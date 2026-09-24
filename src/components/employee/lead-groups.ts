import { customerKeyOf } from "@/lib/customerGroups";
import { collapseUpdates } from "@/lib/statusBatch";
import { leadKey, type LeadCardData, type LeadUpdate } from "@/components/employee/lead-types";

/**
 * A member of staff's leads, folded into the people who sent them.
 *
 * One customer who asks about four products is four Inquiry rows sharing a
 * phone number, and until now the workspace showed them as four unrelated
 * cards: the same name, number and country typed out four times, with no way
 * to see that it is one conversation. The admin console has collapsed them
 * since September (lib/customerGroups.ts) and this uses the SAME key — the
 * last ten digits of the phone number, so "+91 78100 12345" and "7810012345"
 * are one person — so that what the office calls one customer and what the
 * salesperson calls one customer are the same customer.
 *
 * Contact-form messages fold in too, against the same number. They are not
 * products, but they are the same person: someone who wrote in and then asked
 * about two items is one card with three things on it, not a card and two
 * rows in another tab.
 */

/** An entry on a customer's trail, carrying the lead it was written against. */
export interface GroupUpdate extends LeadUpdate {
  /** `leadKey()` of the lead it belongs to. */
  lead: string;
  /** That lead's title — the product's name, or the sender's for a message. */
  leadTitle: string;
}

/** Several rows written by one action: see lib/statusBatch.ts. */
export interface UpdateBatch {
  /** The first row's id — stable, and unique among batches. */
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
  byName: string;
  byMe: boolean;
  /** The titles it was recorded against, in the order they were written. */
  titles: string[];
}

/** One customer, with everything of theirs that is assigned to this person. */
export interface CustomerLeadGroup {
  /** Stable across renders: the normalised phone, or an email/lead fallback. */
  key: string;
  customerName: string;
  /** Other names the same number has written in under. */
  altNames: string[];
  companyName: string | null;
  email: string | null;
  altEmails: string[];
  country: string;
  phone: string;
  /** Their leads, newest first: quote requests, messages and freight requests together. */
  leads: LeadCardData[];
  inquiryCount: number;
  contactCount: number;
  shipmentCount: number;
  /** Across their quote requests; messages have no quantity. */
  totalQuantity: number;
  firstAt: string;
  lastAt: string;
  /** Every lead's trail merged, newest first. */
  updates: GroupUpdate[];
  /** The newest entry across all of their leads, or null. */
  latest: GroupUpdate | null;
}

/**
 * Fold a flat list of leads into customers, newest activity first.
 *
 * Grouping is by phone; a lead with no usable number falls back to its email,
 * and failing that stands alone — nothing is ever dropped or merged into a
 * stranger because a field was blank.
 */
export function groupLeads(leads: LeadCardData[]): CustomerLeadGroup[] {
  const map = new Map<string, CustomerLeadGroup>();

  for (const lead of leads) {
    const key = customerKeyOf(lead) ?? `lead:${leadKey(lead)}`;

    let g = map.get(key);
    if (!g) {
      g = {
        key,
        customerName: lead.customerName,
        altNames: [],
        companyName: lead.companyName,
        email: lead.email,
        altEmails: [],
        country: lead.country,
        phone: lead.phone,
        leads: [],
        inquiryCount: 0,
        contactCount: 0,
        shipmentCount: 0,
        totalQuantity: 0,
        firstAt: lead.createdAt,
        lastAt: lead.createdAt,
        updates: [],
        latest: null,
      };
      map.set(key, g);
    }

    // Variants are kept, not overwritten: the name on the newest inquiry is
    // the one shown, and the others are said out loud underneath rather than
    // silently discarded — on the phone it matters that they have also
    // written in as somebody else.
    if (lead.customerName && lead.customerName !== g.customerName && !g.altNames.includes(lead.customerName)) {
      g.altNames.push(lead.customerName);
    }
    if (lead.email && lead.email !== g.email && !g.altEmails.includes(lead.email)) {
      g.altEmails.push(lead.email);
    }
    if (!g.companyName && lead.companyName) g.companyName = lead.companyName;
    if (!g.email && lead.email) g.email = lead.email;
    if (!g.country && lead.country) g.country = lead.country;

    g.leads.push(lead);
    if (lead.kind === "inquiry") g.inquiryCount += 1;
    else if (lead.kind === "contact") g.contactCount += 1;
    else g.shipmentCount += 1;
    g.totalQuantity += lead.quantity ?? 0;
    if (lead.createdAt < g.firstAt) g.firstAt = lead.createdAt;
    if (lead.createdAt > g.lastAt) g.lastAt = lead.createdAt;

    for (const u of lead.updates) {
      g.updates.push({ ...u, lead: leadKey(lead), leadTitle: lead.title });
    }
  }

  const groups = [...map.values()];
  const newestFirst = (a: { createdAt: string }, b: { createdAt: string }) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

  for (const g of groups) {
    g.leads.sort(newestFirst);
    g.updates.sort(newestFirst);
    g.latest = g.updates[0] ?? null;
    // The newest lead is the one they are currently talking about, so its
    // name and company lead the card.
    const newest = g.leads[0];
    if (newest) {
      g.customerName = newest.customerName;
      g.altNames = g.altNames.filter((n) => n !== newest.customerName);
      for (const lead of g.leads.slice(1)) {
        if (lead.customerName && lead.customerName !== newest.customerName && !g.altNames.includes(lead.customerName)) {
          g.altNames.push(lead.customerName);
        }
      }
    }
  }
  groups.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  return groups;
}

/** Everything recorded for one customer, one entry per action. */
export function batchesOf(updates: GroupUpdate[]): UpdateBatch[] {
  return collapseUpdates(updates, (u) => ({ status: u.status, note: u.note, createdAt: u.createdAt, employeeId: u.byName })).map(
    (rows) => ({
      id: rows[0].id,
      status: rows[0].status,
      note: rows[0].note,
      createdAt: rows[0].createdAt,
      byName: rows[0].byName,
      byMe: rows[0].byMe,
      titles: rows.map((r) => r.leadTitle),
    })
  );
}

/** What is searched when somebody types into the box above the list. */
export function groupHaystack(g: CustomerLeadGroup): string {
  return [
    g.customerName,
    ...g.altNames,
    g.companyName ?? "",
    g.email ?? "",
    ...g.altEmails,
    g.phone,
    g.country,
    ...g.leads.map((l) => `${l.title} ${l.message ?? ""}`),
    // A freight request is found by its reference, its ports and its goods.
    ...g.leads.flatMap((l) => (l.freight
      ? [`${l.freight.referenceNo} ${l.freight.portOfLoading} ${l.freight.portOfDischarge} ${l.freight.commodity}`]
      : [])),
  ]
    .join(" ")
    .toLowerCase();
}
