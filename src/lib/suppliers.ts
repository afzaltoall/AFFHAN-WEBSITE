/**
 * The WeChat supplier book: parsing and shaping for the admin directory.
 *
 * Everything here works off one spreadsheet ("SUPPLIER DATA-1.xlsx", 845 rows)
 * that the sourcing team built up contact by contact over WeChat. It was never
 * a database, so the columns hold whatever the person typing them had to hand:
 * the "CONTACT NO." column mixes phone numbers, WeChat IDs, DingTalk IDs and
 * the occasional website, sometimes several in one cell, separated by slashes,
 * commas or newlines and sometimes labelled ("Tel :", "Lin Liyu =").
 *
 * The governing rule for all of it: never lose anything. Every record keeps the
 * original cell verbatim in `contactRaw`, and the UI shows that raw text
 * alongside the structured reading. Where the parse is a judgement call — a
 * bare eleven-digit number that is almost certainly a mainland mobile — the
 * result says so (`assumed`) rather than presenting the guess as fact.
 *
 * Verified against the full sheet: 790 non-empty contact cells yield 732 phone
 * numbers, 93 chat handles and 1 website, with zero digits dropped.
 */

export type ContactKind = "phone" | "handle" | "web";

/** A channel a contact was explicitly tagged with in the source cell. */
export type ContactTag = "whatsapp" | "wechat" | "dingtalk" | "viber" | "telegram";

export interface ContactEntry {
  /** The contact itself, cleaned of labels and channel tags but not reformatted. */
  value: string;
  /** A name or role written before the value — "Tel", "Mobile", "Lin Liyu". */
  label: string | null;
  /** Channels named in trailing parentheses: "(wechat & WHATSAPP)". */
  tags: ContactTag[];
}

export interface ParsedContact {
  phones: ContactEntry[];
  handles: ContactEntry[];
  webs: ContactEntry[];
}

const stripLeadingPunct = (s: string) => s.replace(/^[\s:=,;.\-]+/, "").trim();
const digitsOf = (s: string) => (s.match(/\d/g) || []).length;

/**
 * Pull a leading label off a token.
 *
 * Two shapes appear in the sheet: an explicit "Tel : 86…" / "Lin Liyu = +86…",
 * and a bare "Mobile 86-3266128220" or "LAN 15158976666" where a name simply
 * runs into the number. The second form only applies when what follows is
 * unambiguously a number — otherwise a WeChat ID like "chinaxiaolian" would be
 * cut in half.
 */
function stripLabel(token: string): { label: string | null; value: string } {
  // No dotAll flag: splitTokens has already broken the cell on newlines, so a
  // token never contains one, and the project targets ES2017 where /s is not
  // available anyway.
  const withColon = token.match(/^\s*([^:=]{1,28}?)\s*[:=]\s*(.+)$/);
  if (withColon && withColon[1].trim()) return { label: withColon[1].trim(), value: withColon[2].trim() };
  const worded = token.match(/^([A-Za-z][A-Za-z .'&-]{0,24}?)\s+(\+?\d[\d\s()\-.]{5,})$/);
  if (worded) return { label: worded[1].trim(), value: worded[2].trim() };
  return { label: null, value: stripLeadingPunct(token) };
}

/**
 * Lift channel names out of trailing parentheses.
 *
 * Only parentheses that actually name a channel are removed. "(+86)" and
 * "(0)20" are part of the number and have to survive.
 */
function extractTags(value: string): { tags: ContactTag[]; value: string } {
  const tags = new Set<ContactTag>();
  const cleaned = value.replace(/\(([^)]*)\)/g, (full, inner: string) => {
    if (!/whats\s?app|wechat|we\s?chat|weixin|dingtalk|dingding|viber|telegram/i.test(inner)) return full;
    if (/whats\s?app/i.test(inner)) tags.add("whatsapp");
    if (/wechat|we\s?chat|weixin/i.test(inner)) tags.add("wechat");
    if (/dingtalk|dingding/i.test(inner)) tags.add("dingtalk");
    if (/viber/i.test(inner)) tags.add("viber");
    if (/telegram/i.test(inner)) tags.add("telegram");
    return " ";
  });
  return { tags: [...tags], value: cleaned.replace(/\s{2,}/g, " ").trim() };
}

function classify(value: string): ContactKind {
  const trimmed = value.trim();
  if (/^(https?:\/\/|www\.)/i.test(trimmed) || /\.(com|cn|net|org)(\.[a-z]{2})?$/i.test(trimmed)) return "web";
  const bare = value.replace(/[()\s\-.]/g, "");
  if (/[a-z一-鿿]/i.test(bare)) return "handle";
  return digitsOf(bare) >= 6 && /^\+?\d+$/.test(bare) ? "phone" : "handle";
}

/**
 * Break a cell into individual contacts.
 *
 * Newlines, slashes, semicolons and pipes always separate. Commas separate too
 * — no address ever reaches this function, so "8613967922798,KOLLMAX85" is
 * safe to split. A slash followed by Chinese text is left alone: one entry
 * reads "0757-289170028/5号送到", where the slash is part of a delivery note.
 *
 * A run of two or more spaces separates only when both halves are substantial
 * numbers, which distinguishes "0757 86768320  13922133384" (a landline and a
 * mobile) from "+86  13662111277" (one number typed with a stray space).
 */
function splitTokens(raw: string): string[] {
  return raw
    .split(/[\r\n]+|\s*\/\s*(?!\d*\D*号)|\s*[;、|]\s*/)
    .flatMap((p) => (p.includes(",") ? p.split(/\s*,\s*/) : [p]))
    .flatMap((p) => {
      if (!/^\+?[\d()\-. ]+$/.test(p) || !/\d\s{2,}\d/.test(p)) return [p];
      const parts = p.split(/\s{2,}/);
      return parts.every((x) => digitsOf(x) >= 6) ? parts : [p];
    })
    .map(stripLeadingPunct)
    .filter(Boolean);
}

/**
 * Tidy a leading dialling code without touching the rest of the number.
 *
 * Three forms in the sheet need it: "(+)351 …" (the code fell out of the
 * brackets), "(+86) 187…" (bracketed code) and "+86 86 182…" (code typed
 * twice). A bracketed "(0)" mid-number — "+86 (0)20 2388 9722" — is the
 * standard way of writing an optional trunk digit and is deliberately left
 * alone, since these rules only ever fire at the very start of the string.
 */
const normalisePrefix = (v: string) =>
  v
    .replace(/^\(\s*\+?\s*\)\s*(?=\d)/, "+")
    .replace(/^\(\s*\+?\s*(\d{1,4})\s*\)\s*/, "+$1 ")
    // The separator here must be at least one space or hyphen. With it
    // optional, the engine backtracks the code down to a single digit and
    // "+66 99 142 7146" collapses to "+6 99 142 7146" — a real number quietly
    // corrupted. Requiring a separator makes the two halves unambiguous.
    .replace(/^(\+(\d{1,4}))[\s-]+\+?\2(?=[\s-]*\d)/, "$1");

export function parseContact(raw: string | null | undefined): ParsedContact {
  if (!raw) return { phones: [], handles: [], webs: [] };
  const phones: ContactEntry[] = [];
  const handles: ContactEntry[] = [];
  const webs: ContactEntry[] = [];
  for (const token of splitTokens(stripLeadingPunct(String(raw)))) {
    const { label, value: afterLabel } = stripLabel(token);
    const { tags, value: tagged } = extractTags(afterLabel);
    const value = normalisePrefix(tagged);
    if (!value) continue;
    const entry: ContactEntry = { value, label, tags };
    const kind = classify(value);
    if (kind === "phone") phones.push(entry);
    else if (kind === "web") webs.push(entry);
    else handles.push(entry);
  }
  return { phones, handles, webs };
}

export interface DialTarget {
  /** E.164 form for tel:/wa.me, or null when the number can't be dialled as written. */
  e164: string | null;
  /** True when we supplied the country code rather than reading it off the sheet. */
  assumed: boolean;
  /** True when the source recorded too few digits for the number to be callable. */
  incomplete: boolean;
}

/**
 * Turn a written number into something dialable.
 *
 * Roughly a third of the sheet's numbers carry no country code at all — the
 * team typed what they saw in WeChat. An eleven-digit number beginning 1 is a
 * mainland mobile and a "0 + area code + 7–8 digits" number is a mainland
 * landline, so both get +86, flagged `assumed` so the interface can mark them.
 * Anything we cannot place is returned with a null target and still displayed:
 * a number we cannot dial is not a number we may hide.
 */
export function dialTarget(value: string): DialTarget {
  const raw = String(value).trim();
  const digits = raw.replace(/\D/g, "");
  const explicit = /^\(?\+/.test(raw) || /^00\d/.test(raw);

  if (explicit) {
    let d = digits.replace(/^00/, "");
    // "+86 86 182…" — the dialling code transcribed twice.
    const dup = d.match(/^(86|91|44|65|60|971)(\d{8,})$/);
    if (dup && dup[2].startsWith(dup[1])) d = dup[2];
    // Mainland numbers keep a trunk "0" before the area code domestically and
    // drop it internationally. Only applied to +86: in +90 or +49 that digit
    // belongs to the country code itself.
    const trunk = d.match(/^860(\d{8,})$/);
    if (trunk) d = "86" + trunk[1];
    return { e164: d.length >= 8 ? "+" + d : null, assumed: false, incomplete: d.length < 8 };
  }

  // "086 193…" — the international prefix, one zero short.
  const short = digits.match(/^086(\d{9,11})$/);
  if (short) return { e164: "+86" + short[1], assumed: false, incomplete: false };
  // Bare mainland mobile: eleven digits, always starting 1.
  if (/^1\d{10}$/.test(digits)) return { e164: "+86" + digits, assumed: true, incomplete: false };
  // Country code written without the plus.
  if (/^86(1\d{10})$/.test(digits)) return { e164: "+" + digits, assumed: false, incomplete: false };
  // "86-0574-63090810" — country code, then the domestic trunk zero.
  const cnTrunk = digits.match(/^860(\d{9,11})$/);
  if (cnTrunk) return { e164: "+86" + cnTrunk[1], assumed: false, incomplete: false };
  // Domestic landline: trunk zero, 2–3 digit area code, 7–8 digit subscriber.
  const land = digits.match(/^0(\d{2,3})(\d{7,8})$/);
  if (land) return { e164: "+86" + land[1] + land[2], assumed: true, incomplete: false };

  // Ten digits beginning 1 is a mainland mobile with a digit lost in
  // transcription; there are several in the sheet and they are worth flagging.
  const truncated = /^1\d{9}$/.test(digits) || (digits.length > 0 && digits.length < 8);
  return { e164: null, assumed: false, incomplete: truncated };
}

/**
 * Split the free-text PRODUCT column into individual items.
 *
 * The column holds anything from "Football" to a comma-separated list of nine
 * fertiliser grades. Splitting gives the directory real filter facets; the
 * original text stays on the record so nothing is paraphrased away.
 */
export function splitProducts(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/\s*[,;、]\s*|\s+(?:and|&)\s+|\s*\/\s*/i)
    .map((s) => s.replace(/[.\s]+$/, "").trim())
    .filter((s) => s.length > 1);
}

/**
 * Title Case for the columns that are mostly SHOUTED.
 *
 * 521 of the 845 supplier names are in full caps and the rest are not, so a
 * list rendered as typed reads as two different documents stapled together.
 * Only all-caps strings are touched; anything with a lowercase letter in it was
 * typed deliberately and is left exactly as the team wrote it.
 */
export function tidyCase(s: string | null | undefined): string {
  if (!s) return "";
  const t = s.trim().replace(/\s{2,}/g, " ");
  if (/[a-z]/.test(t)) return t;
  return t
    .toLowerCase()
    .replace(/(^|[\s(\-/&.])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())
    .replace(/\b(Co|Ltd|Llc|Inc|Pvt|Wll|Ro|Led|Pu|Pvc|Abs)\b/g, (w) => w.toUpperCase());
}

// --- Shaping a database row into something the directory can render ---------

/** The Supplier columns the directory needs, as Prisma returns them. */
export interface SupplierRow {
  id: number;
  sourceRow: number;
  serial: number | null;
  personName: string | null;
  companyName: string | null;
  productsRaw: string | null;
  address: string | null;
  contactRaw: string | null;
}

export interface PhoneView extends ContactEntry, DialTarget {}

export interface SupplierRecord {
  id: number;
  serial: number | null;
  sourceRow: number;
  /** Display forms — tidied case only, never reworded. */
  person: string;
  company: string;
  address: string;
  /** The PRODUCT cell as typed, and the same cell split into filterable items. */
  productsRaw: string;
  products: string[];
  /** The CONTACT cell as typed. Always rendered somewhere, never only parsed. */
  contactRaw: string;
  phones: PhoneView[];
  handles: ContactEntry[];
  webs: ContactEntry[];
  flags: {
    noContact: boolean;
    noCompany: boolean;
    noAddress: boolean;
    noPerson: boolean;
    /** At least one number too short to dial — a transcription slip worth fixing. */
    incompleteNumber: boolean;
  };
}

/**
 * What to call a supplier that has no company name.
 *
 * 364 of the 845 rows have no company and 21 have neither company nor person,
 * so the list needs a deterministic fallback or those rows render as a blank
 * line and become unfindable.
 */
export function supplierTitle(r: Pick<SupplierRecord, "company" | "person" | "serial" | "id">): string {
  if (r.company) return r.company;
  if (r.person) return r.person;
  return r.serial !== null ? `Supplier #${r.serial}` : `Supplier (row ${r.id})`;
}

/**
 * Drop repeats from a split product cell, ignoring case.
 *
 * The cell is free text, so "Fabric, fabric" is one product typed twice rather
 * than two, and it would otherwise render as two identical chips — and, since
 * the chips are keyed by name, as a React duplicate-key error. Case has to be
 * ignored for this to work at all: tidyCase deliberately leaves anything
 * containing a lowercase letter exactly as it was typed, so the two spellings
 * survive to this point looking different.
 *
 * The first spelling seen is the one kept, so the display still reflects how
 * the team wrote it.
 */
function dedupeProducts(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toSupplierRecord(row: SupplierRow): SupplierRecord {
  const parsed = parseContact(row.contactRaw);
  const person = tidyCase(row.personName);
  const company = tidyCase(row.companyName);
  const address = (row.address || "").trim();
  const productsRaw = (row.productsRaw || "").trim();
  const contactRaw = (row.contactRaw || "").trim();

  const phones: PhoneView[] = parsed.phones.map((p) => ({ ...p, ...dialTarget(p.value) }));

  return {
    id: row.id,
    serial: row.serial,
    sourceRow: row.sourceRow,
    person,
    company,
    address,
    productsRaw,
    products: dedupeProducts(splitProducts(productsRaw).map(tidyCase)),
    contactRaw,
    phones,
    handles: parsed.handles,
    webs: parsed.webs,
    flags: {
      noContact: !contactRaw,
      noCompany: !company,
      noAddress: !address,
      noPerson: !person,
      incompleteNumber: phones.some((p) => p.incomplete),
    },
  };
}

/**
 * The strings the directory's search box matches against.
 *
 * Built in the browser rather than sent with each record. Every part of it is
 * already present in the record — it is the same text a second time — and on
 * 845 rows that duplication was about 40% of the payload for the heaviest page
 * in the admin. Rebuilding it costs a single pass at mount.
 *
 * `digits` exists so that typing a phone number finds it however the sheet
 * punctuated it: "13802226624" matches a row recorded as "+86 138 0222 6624".
 */
export function haystack(r: SupplierRecord): { search: string; digits: string } {
  return {
    search: [r.person, r.company, r.productsRaw, r.address, r.contactRaw, r.serial]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    digits: r.contactRaw.replace(/\D/g, ""),
  };
}
