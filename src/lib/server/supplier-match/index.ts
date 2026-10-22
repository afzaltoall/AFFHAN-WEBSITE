import "server-only";
import { prisma } from "@/lib/prisma";
import { toSupplierRecord, type ContactEntry, type PhoneView } from "@/lib/suppliers";
import cleanCategories from "./clean-categories.json";
import { categoryPath } from "./categories";
import { loadIndex, matchInquiry, resolveInquiryCategory, supplierDisplayName, type CategorySource, type MatchIndex, type Query } from "./match";

/**
 * Supplier suggestions for one inquiry, for the admin console's inquiry panel only
 * (GET /api/admin/inquiries/[id]/supplier-matches). Supplier data never leaves through anything else: every file of
 * this folder is server-only, and nothing public imports it.
 *
 * The suppliers and their terms are read once and kept in memory for ten minutes (the book changes only when
 * scripts/import_suppliers.mjs runs; invalidateSupplierMatchIndex() is for a future edit route). An inquiry then
 * costs two statements: its product's category, and the match itself.
 */

const TTL_MS = 10 * 60 * 1000;
const CLEAN: ReadonlySet<string> = new Set(cleanCategories.categories.map((c) => c.id));
const query: Query = (sql, params) => prisma.$queryRawUnsafe(sql, ...params);

let held: { index: MatchIndex; at: number } | null = null;
let loading: Promise<MatchIndex> | null = null;

/** Drop the cached supplier book, so the next request reads it again. */
export function invalidateSupplierMatchIndex() {
  held = null;
}

async function currentIndex(): Promise<MatchIndex> {
  if (held && Date.now() - held.at < TTL_MS) return held.index;
  loading ??= loadIndex(query)
    .then((index) => {
      held = { index, at: Date.now() };
      return index;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

export interface SupplierSuggestion {
  id: number;
  /** Company, else the contact person, else "Supplier #<id>". */
  name: string;
  person: string;
  /** The supplier's PRODUCTS cell as the team typed it. */
  products: string;
  score: number;
  vague: boolean;
  term: string;
  matchedWords: string[];
  synonym: boolean;
  matchedCategory: string | null;
  phones: PhoneView[];
  handles: ContactEntry[];
  webs: ContactEntry[];
  contactRaw: string;
}

export interface SupplierMatchesResponse {
  inquiryId: string;
  title: string;
  category: string | null;
  categorySource: CategorySource;
  suggestions: SupplierSuggestion[];
  total: number;
  searchWord: string;
  /** Milliseconds for the category and the match, on the server. */
  ms: number;
}

/** Up to ten suppliers for the inquiry (website or app), or null when there is no such inquiry. */
export async function supplierMatchesFor(inquiryId: string): Promise<SupplierMatchesResponse | null> {
  const inquiry =
    (await prisma.inquiry.findUnique({ where: { id: inquiryId }, select: { id: true, productId: true, productName: true } })) ??
    (await prisma.mobileInquiry.findUnique({ where: { id: inquiryId }, select: { id: true, productId: true, productName: true } }));
  if (!inquiry) return null;

  const index = await currentIndex();
  const started = performance.now();
  const { category, source } = await resolveInquiryCategory(query, inquiry);
  const result = await matchInquiry(index, { title: inquiry.productName, category }, CLEAN, query, 10);
  const ms = Math.round(performance.now() - started);

  const suggestions: SupplierSuggestion[] = [];
  for (const m of result.matches) {
    const row = index.rows.get(m.supplierId);
    if (!row) continue;
    const record = toSupplierRecord(row);
    suggestions.push({
      id: record.id,
      name: supplierDisplayName(record.company, record.person, record.id),
      person: record.person,
      products: record.productsRaw,
      score: m.score,
      vague: m.vague,
      term: m.term,
      matchedWords: m.matchedWords,
      synonym: m.synonym,
      matchedCategory: m.matchedCategory,
      phones: record.phones,
      handles: record.handles,
      webs: record.webs,
      contactRaw: record.contactRaw,
    });
  }
  return {
    inquiryId: inquiry.id,
    title: inquiry.productName,
    category: category ? categoryPath(category) : null,
    categorySource: source,
    suggestions,
    total: result.total,
    searchWord: result.searchWord,
    ms,
  };
}
