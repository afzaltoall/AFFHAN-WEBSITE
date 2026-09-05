// Customer de-duplication for the admin console.
//
// One customer who inquires about 4 different products creates 4 separate
// Inquiry rows that all share the same phone number. For the admin's "duplicate
// user" view and the grouped Excel export we collapse those rows into ONE
// customer, keyed by their phone number, and list every product they asked
// about underneath.
//
// Why phone (not name/email): the same person often retypes their name slightly
// or leaves email blank across submissions, but the mobile number is the one
// stable handle in a B2B sourcing inquiry (it's how the team calls / WhatsApps
// them). See CLAUDE.md — inquiries are the core lead data.

/** The subset of an inquiry the grouping cares about. */
export interface GroupableInquiry {
  /** The row's own id, so a grouped line can be traced back to its inquiry. */
  id?: string;
  customerName: string;
  companyName?: string | null;
  email?: string | null;
  country: string;
  phone: string;
  productName: string;
  productImage?: string | null;
  quantity: number;
  createdAt: string | Date;
  status?: string;
}

/** One product line inside a grouped customer. */
export interface GroupedProduct {
  /**
   * The inquiry this line came from. Optional because grouping is also run
   * over the export's own row shape, which has no ids to give — the .xlsx
   * lists products, not links. Present for anything the console groups, which
   * is what lets a grouped line open the inquiry it belongs to.
   */
  inquiryId?: string;
  productName: string;
  /** For the thumbnail. A grouped line reads as a product, so it shows one. */
  productImage?: string | null;
  quantity: number;
  createdAt: string;
}

/** A single de-duplicated customer with all of their inquiries folded in. */
export interface CustomerGroup {
  /** Stable key (normalised phone) used for React keys and dedup. */
  key: string;
  customerName: string;
  companyName: string | null;
  email: string | null;
  country: string;
  phone: string;
  /** Distinct names/emails seen for this phone, if the customer varied them. */
  altNames: string[];
  altEmails: string[];
  products: GroupedProduct[];
  totalQuantity: number;
  inquiryCount: number;
  firstInquiry: string;
  lastInquiry: string;
}

/**
 * Normalise a raw phone string into a stable dedup key.
 *
 * Strips everything but digits, then anchors on the last 10 digits so that the
 * SAME number entered with and without its country code ("+91 78100 12345" vs
 * "7810012345") collapses to one customer. Numbers shorter than 10 digits are
 * used whole. Returns "" for empty input (callers fall back to another key).
 */
export function normalizePhoneKey(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

const iso = (v: string | Date) => (v instanceof Date ? v.toISOString() : v);

/**
 * Fold a flat list of inquiries into de-duplicated customers.
 *
 * Grouping key is the normalised phone; if a row has no usable phone it falls
 * back to a lowercased email, and failing that the row stands alone (keyed by a
 * synthetic id) so nothing is ever silently dropped. Customers are returned
 * most-recently-active first; each customer's products are newest first.
 */
export function groupCustomers(rows: GroupableInquiry[]): CustomerGroup[] {
  const map = new Map<string, CustomerGroup>();

  rows.forEach((r, idx) => {
    const phoneKey = normalizePhoneKey(r.phone);
    const emailKey = (r.email || "").trim().toLowerCase();
    const key = phoneKey || (emailKey ? `email:${emailKey}` : `row:${idx}`);
    const created = iso(r.createdAt);

    let g = map.get(key);
    if (!g) {
      g = {
        key,
        customerName: r.customerName,
        companyName: r.companyName ?? null,
        email: r.email ?? null,
        country: r.country,
        phone: r.phone,
        altNames: [],
        altEmails: [],
        products: [],
        totalQuantity: 0,
        inquiryCount: 0,
        firstInquiry: created,
        lastInquiry: created,
      };
      map.set(key, g);
    }

    // Track name/email variants without overwriting the primary identity.
    if (r.customerName && r.customerName !== g.customerName && !g.altNames.includes(r.customerName)) {
      g.altNames.push(r.customerName);
    }
    if (r.email && r.email !== g.email && !g.altEmails.includes(r.email)) {
      g.altEmails.push(r.email);
    }
    // Prefer keeping the most complete company/email on the primary record.
    if (!g.companyName && r.companyName) g.companyName = r.companyName;
    if (!g.email && r.email) g.email = r.email;

    g.products.push({
      inquiryId: r.id,
      productName: r.productName,
      productImage: r.productImage ?? null,
      quantity: r.quantity,
      createdAt: created,
    });
    g.totalQuantity += r.quantity || 0;
    g.inquiryCount += 1;
    if (created < g.firstInquiry) g.firstInquiry = created;
    if (created > g.lastInquiry) g.lastInquiry = created;
  });

  const groups = [...map.values()];
  groups.forEach((g) => g.products.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
  groups.sort((a, b) => (a.lastInquiry < b.lastInquiry ? 1 : -1));
  return groups;
}

/** Split a stored phone ("+91 7810012345" / bare digits) into code + number. */
export function splitPhone(raw: string): { code: string; number: string } {
  const s = (raw || "").trim();
  const m = s.match(/^(\+\d{1,4})[\s-]*(.*)$/);
  if (m) return { code: m[1], number: m[2].trim() };
  return { code: "", number: s };
}

const sheetDate = (v: string) =>
  new Date(v).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

/**
 * Build the rows for the "Customers" spreadsheet from grouped customers, in the
 * header-band layout: one contact row per customer, then a numbered row per
 * product, then a blank separator. Returned as plain data (no xlsx dependency)
 * so BOTH the server master export and the client "export selected" checklist
 * produce a byte-identical sheet.
 *
 * `textCols` are the 0-based columns that must be forced to Excel TEXT format
 * (phone/code) so long numbers don't render as "9.16E+11".
 */
export function buildCustomerSheet(groups: CustomerGroup[]): {
  aoa: (string | number)[][];
  cols: { wch: number }[];
  textCols: number[];
} {
  const headers = [
    "S.No", "Customer", "Company", "Email", "Country", "Code", "Phone",
    "Inquiries", "Total Qty", "Product", "Qty", "Ordered On",
  ];
  const aoa: (string | number)[][] = [headers];
  groups.forEach((g, gi) => {
    const { code, number } = splitPhone(g.phone);
    const emailCell = [g.email, ...g.altEmails].filter(Boolean).join(", ");
    const nameCell = g.altNames.length ? `${g.customerName} (also: ${g.altNames.join(", ")})` : g.customerName;
    aoa.push([gi + 1, nameCell, g.companyName || "", emailCell, g.country, code, number, g.inquiryCount, g.totalQuantity, "", "", ""]);
    g.products.forEach((p, k) => {
      aoa.push(["", "", "", "", "", "", "", "", "", `${k + 1}.  ${p.productName}`, p.quantity, sheetDate(p.createdAt)]);
    });
    aoa.push(["", "", "", "", "", "", "", "", "", "", "", ""]); // separator
  });
  const cols = [
    { wch: 6 }, { wch: 26 }, { wch: 18 }, { wch: 28 }, { wch: 12 }, { wch: 7 },
    { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 58 }, { wch: 7 }, { wch: 14 },
  ];
  return { aoa, cols, textCols: [5, 6] };
}
