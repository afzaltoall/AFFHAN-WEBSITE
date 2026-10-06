/**
 * What a search means, before any SQL: the words worth matching, the
 * category the shopper is after, and what else they told us (a budget, an
 * order quantity). Pure and dependency-free, so it is the same on the server
 * and in a test, and costs microseconds.
 *
 * Why it exists (the owner's report of 2026-10-06: "our search engine is
 * very dumb"): the old core AND-ed every word of the query into the product
 * name, so "mobile phones under 10000" asked for names containing "under"
 * and "10000", matched nothing and fell back to a fuzzy guess; and it matched
 * categories as substrings, so "mobile" found "Automobiles Seat Covers". The
 * catalogue's 193 real phones sit in leaves CJ named "5-inch Display", "Dual
 * SIM Card", "Octa Core"…, under "Mobile Phones", which holds none itself, so
 * no name match could reach them.
 *
 * understandQuery() reads the query:
 *   - a budget ("under 10000", "below 10k", "₹15,000-20,000", "1.5 lakh")
 *     and an order quantity ("500 pcs", "moq 100", "2 containers") come out
 *     of the words. There are no prices in the catalogue (CJ's were never
 *     ours, and none is ever shown), so a budget filters nothing: it is said
 *     back to the shopper, and goes with their quote request;
 *   - sourcing filler ("wholesale", "from china", "best price", "supplier")
 *     is dropped, so it cannot sink a match;
 *   - everyday and Indian English becomes the catalogue's words ("mobile",
 *     "pendrive", "specs", "chappal", "tee"), and typos are corrected
 *     against the catalogue's own vocabulary (correctWords).
 *
 * resolveCategories() finds the category the words name: by whole words,
 * never substrings; a category's own name above its parents'; the one whose
 * head noun is the query's ("phone case" is a case, "mobile phone" a phone,
 * "dress watch" a watch); answering with its whole subtree, which is where
 * the products are.
 */

// ---- Vocabulary of meaning -------------------------------------------------

/** Grammar that carries no intent. */
const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "by", "for", "with", "without", "from",
  "my", "your", "our", "some", "any", "all", "please", "want", "wanted", "need", "needed", "looking",
  "search", "show", "find", "get", "me", "i", "we", "you", "is", "are", "am", "be", "that", "this", "these",
  "those", "it", "its", "which", "who", "what", "where", "how", "can", "do", "does", "will", "should",
]);
/** Where a head noun ends: "case for iphone", "bag with wheels". */
const PREPOSITIONS = new Set(["for", "with", "without", "of", "in", "on", "to", "from"]);

/**
 * Sourcing and shopping filler: true of everything here, so it cannot tell
 * one product from another, and AND-ed into a name match it sinks the match.
 * Never "top", "high", "low", "new", "mini", "pro", "plus", "set": those are
 * in product names ("crop top", "high heels", "new born", "gift set").
 */
const FILLER = new Set([
  "wholesale", "wholesaler", "wholesalers", "supplier", "suppliers", "supply", "manufacturer", "manufacturers",
  "manufacturing", "factory", "factories", "bulk", "import", "imports", "importer", "importers", "export",
  "exporter", "exporters", "dealer", "dealers", "distributor", "distributors", "trader", "traders",
  "china", "chinese", "india", "indian", "price", "prices", "pricing", "priced", "cost", "costs", "rate", "rates",
  "cheap", "cheaper", "cheapest", "affordable", "best", "good", "nice", "quality", "latest", "trending",
  "buy", "buying", "purchase", "order", "online", "sale", "deal", "deals", "offer", "offers", "discount",
  "genuine", "quote", "quotation", "sourcing", "source", "budget", "near", "item", "items", "stuff",
  "product", "products", "rs", "inr", "rupees", "rupee", "usd", "dollar", "dollars", "lowest", "range",
]);

/** Compound words written several ways, made one, in queries and category names alike. */
const COMPOUNDS: [RegExp, string][] = [
  [/\bt[\s-]?shirts?\b/g, "tshirt"],
  [/\bcell\s*phones?\b/g, "smartphone"],
  [/\bsmart\s*phones?\b/g, "smartphone"],
  [/\bsmart\s*watch(?:es)?\b/g, "smartwatch"],
  [/\bear\s*buds?\b/g, "earbuds"],
  [/\bear\s*phones?\b/g, "earphones"],
  [/\bhead\s*phones?\b/g, "headphones"],
  [/\bhead\s*sets?\b/g, "headphones"],
  [/\bsun\s*glass(?:es)?\b/g, "sunglasses"],
  [/\bflip[\s-]*flops?\b/g, "flipflops"],
  [/\bpen\s*drives?\b/g, "flash drive"],
  [/\bpower\s*banks?\b/g, "powerbank"],
  [/\bback\s*packs?\b/g, "backpack"],
];

/**
 * One spelling for words written several ways, in queries and in category
 * names alike: whom a thing is for ("Lady Dresses" and "ladies dress" are
 * both women's), and plurals the stemmer leaves whole.
 */
const SAME_AS: Record<string, string> = {
  mobiles: "mobile", smartphones: "smartphone", iphones: "iphone", tshirts: "tshirt", powerbanks: "powerbank",
  slipper: "slippers", flipflop: "flipflops", sneaker: "sneakers", earphone: "earphones", headphone: "headphones",
  hoodie: "hoodies", sweatshirt: "sweatshirts", trouser: "pants", trousers: "pants", pant: "pants", jean: "jeans",
  laptops: "laptop", handbags: "handbag",
  mens: "men", man: "men", male: "men", gents: "men", gent: "men", boys: "boy",
  womens: "women", woman: "women", female: "women", ladies: "women", lady: "women", girls: "girl",
  kid: "kids", children: "kids", child: "kids", childrens: "kids", babies: "baby", infant: "baby",
  infants: "baby", toddler: "baby", toddlers: "baby", newborn: "baby",
};
/**
 * What shoppers call something the catalogue names otherwise: queries only.
 * Never applied to category names, where it would be wrong ("Trainers" in
 * Pet Outdoor Supplies are dog trainers, not shoes).
 */
const QUERY_SAME_AS: Record<string, string> = {
  cellphone: "smartphone", cellphones: "smartphone", handphone: "smartphone",
  tee: "tshirt", tees: "tshirt",
  pendrive: "flash", pendrives: "flash",
  specs: "glasses", spectacles: "glasses", eyeglasses: "glasses", shades: "sunglasses",
  chappal: "slippers", chappals: "slippers", trainers: "sneakers",
  mixie: "blender", geyser: "heater", almirah: "wardrobe", cupboard: "wardrobe",
  tv: "television", tvs: "television", telly: "television", fridge: "refrigerator",
  earbud: "earbuds", earpods: "earbuds", airpods: "earbuds", tws: "earbuds",
  jumper: "sweater", jumpers: "sweaters", pullover: "sweater",
  purse: "wallet", purses: "wallets", couch: "sofa", couches: "sofas",
  torch: "flashlight", torches: "flashlights", notebooks: "laptop",
};

/**
 * Words that mean the same for matching, both ways: a query word matches
 * any of its group in a category name and in a product name. Small and
 * certain; each was checked against the catalogue's names.
 */
const GROUPS: string[][] = [
  ["mobile", "phone", "smartphone"],
  ["television", "tv"],
  ["laptop", "notebook"],
  ["football", "soccer"],
  ["refrigerator", "fridge"],
  ["earbuds", "earphones", "headphones"],
  ["glasses", "eyewear", "spectacles"],
  ["wallet", "purse"],
  ["sofa", "couch"],
  ["flashlight", "torch"],
  ["sweater", "jumper", "pullover"],
  ["pants", "trousers"],
  ["hoodies", "sweatshirts"],
  ["case", "cover"],
  ["charger", "adapter"],
  ["cable", "cord", "wire"],
  ["lamp", "light"],
  ["bulb", "light"],
  ["wardrobe", "closet"],
  ["blender", "mixer"],
  ["clothes", "clothing", "apparel"],
  ["light", "lighting"],
  ["car", "auto", "automobile", "vehicle"],
  ["kit", "set"],
];

/** GROUPS joined where they share a word ("bulb", "light", "lamp", "lighting" are one), by word and by stem. */
const EQUIVALENT = (() => {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  const add = (x: string) => { if (!parent.has(x)) parent.set(x, x); };
  for (const g of GROUPS) {
    for (const w of g) add(w);
    for (const w of g.slice(1)) parent.set(find(w), find(g[0]));
  }
  const sets = new Map<string, Set<string>>();
  for (const w of parent.keys()) {
    const r = find(w);
    if (!sets.has(r)) sets.set(r, new Set());
    sets.get(r)!.add(w);
  }
  const byWord = new Map<string, Set<string>>();
  for (const set of sets.values()) for (const w of set) byWord.set(w, set);
  return byWord;
})();

/**
 * Words that imply a broader one, one way only: sneakers are shoes, but
 * shoes are not all sneakers. Used for categories only (a "dog" search
 * reaches "Pet Collars"), never to widen a product-name match.
 */
const BROADER: Record<string, string[]> = {
  sneakers: ["shoe"], boot: ["shoe"], sandal: ["shoe"], slippers: ["shoe"], heel: ["shoe"], loafer: ["shoe"],
  backpack: ["bag"], handbag: ["bag"], tote: ["bag"], clutch: ["bag"], purse: ["bag", "wallet"],
  iphone: ["phone", "mobile"], smartphone: ["phone", "mobile"], android: ["phone"],
  dog: ["pet"], cat: ["pet"], puppy: ["pet", "dog"], kitten: ["pet", "cat"],
  necklace: ["jewelry"], earring: ["jewelry"], ring: ["jewelry"], bracelet: ["jewelry"],
  kurti: ["blouse", "dress"], saree: ["dress"], lehenga: ["dress"], gown: ["dress"],
  smartwatch: ["watch"], tshirt: ["shirt"], blazer: ["jacket"], hoodies: ["sweatshirts"],
  bike: ["bicycle", "motorcycle"], cycle: ["bicycle"],
  bottle: ["drinkware"], mug: ["drinkware"], cup: ["drinkware"], tumbler: ["drinkware"], flask: ["drinkware"],
  plate: ["dinnerware"], bowl: ["dinnerware"], cutlery: ["dinnerware"], spoon: ["dinnerware"], fork: ["dinnerware"],
  bedsheet: ["bedding"], duvet: ["bedding"], quilt: ["bedding"],
  chair: ["furniture"], sofa: ["furniture"], table: ["furniture"], desk: ["furniture"], stool: ["furniture"],
  shelf: ["furniture"], cabinet: ["furniture"], wardrobe: ["furniture"], bench: ["furniture"],
};

/** Whom a name is for. In a category's name they narrow it without making it a different thing. */
const AUDIENCE = new Set(["men", "women", "unisex", "adult", "man", "woman", "lady"]);
/** Whom else: these do make it a different thing ("Pet Dresses" are not what "dress" means). */
const QUALIFIER_AUDIENCE = new Set(["girl", "boy", "kid", "kids", "baby", "pet", "dog", "cat", "child"]);

/** Words that say nothing about what is in a category ("Other Replacement Parts", "Various Gemstones"). */
const EMPTY = new Set(["other", "others", "various", "more", "misc", "general"]);
/** Words that name a category's kind only loosely: a head like these is not a different thing. */
const GENERIC = new Set([...EMPTY, "accessory", "part", "supply", "product", "tool", "set", "kit", "item", "essential"]);

/** Things whose searches drown in their own accessories. */
const DEVICES = new Set([
  "phone", "mobile", "smartphone", "iphone", "laptop", "tablet", "ipad", "computer", "watch", "smartwatch",
  "camera", "drone", "console", "television", "monitor", "projector", "printer", "speaker", "headphones",
  "earbuds", "earphones", "router", "bicycle", "scooter", "guitar", "violin", "keyboard", "microphone",
  // Appliances: "hair dryer" is the dryer before its wall holder and its diffuser.
  "dryer", "straightener", "curler", "trimmer", "shaver", "epilator", "kettle", "blender", "juicer", "mixer",
  "toaster", "fan", "heater", "vacuum", "humidifier", "purifier", "massager",
  // Furniture and knives: "office chair" is the chair before its cushion and slipcover.
  "chair", "sofa", "desk", "table", "bed", "knife",
]);
/** What a device's accessories are called. Not "battery" or "screen": phones' own names have them. */
const ACCESSORY_WORDS = [
  "case", "cases", "cover", "covers", "holder", "holders", "stand", "stands", "mount", "mounts", "bracket",
  "cable", "cables", "charger", "chargers", "adapter", "adapters", "protector", "protectors", "film", "tempered",
  "strap", "straps", "lanyard", "lanyards", "pouch", "sleeve", "skin", "skins", "sticker", "stickers",
  "replacement", "parts", "housing", "dock", "bag", "bags", "box", "storage", "organizer", "hook", "clip", "shelf",
  "tripod", "selfie", "bracelet", "band", "bands", "wristband", "accessories", "accessory", "kit",
  "rack", "nozzle", "diffuser", "attachment", "attachments", "filter", "filters", "blade", "blades", "cord", "cords",
  // Parts: "mobile phone" before a phone's screen assembly.
  "assembly", "digitizer", "repair",
  // What goes on or under furniture, and beside a knife.
  "cushion", "cushions", "slipcover", "slipcovers", "pad", "pads", "mat", "mats", "sharpener",
];
const ACCESSORY = new Set(ACCESSORY_WORDS);

// ---- Words -----------------------------------------------------------------

/** Lowercase, accents off, the rupee sign and dashes made plain, compounds made one, single spaces. */
export function normalizeText(raw: string): string {
  let t = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/₹/g, " inr ")
    .replace(/[‐-―−]/g, "-")
    .replace(/[’‘`]/g, "'");
  for (const [re, to] of COMPOUNDS) t = t.replace(re, to);
  return t.replace(/\s+/g, " ").trim();
}

/** Plural-only nouns, kept whole. */
const WHOLE = new Set(["glasses", "sunglasses", "pants", "jeans", "shorts", "earbuds", "sneakers", "slippers", "clothes", "headphones", "earphones", "hoodies", "sweatshirts", "flipflops", "leggings", "trousers"]);

/**
 * The noun stem a query and a category name are compared on: plural and
 * possessive off ("earrings" → "earring", "dresses" → "dress", "men's" →
 * "men", "accessories" → "accessory", "scarves" → "scarf"). Light on
 * purpose; product names are matched by Postgres's own English stemmer.
 */
export function stem(word: string): string {
  const w = word.replace(/'s$|s'$/, "");
  if (w.length <= 3 || WHOLE.has(w)) return w;
  if (w === "knives") return "knife";
  if (w === "kids") return "kids";
  if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + "y";
  if (/(ss|x|ch|sh|z)es$/.test(w)) return w.slice(0, -2);
  if (/[^aeiou]ves$/.test(w) || /[aeo]lves$/.test(w)) return w.slice(0, -3) + "f";
  if (/[^su]s$/.test(w)) return w.slice(0, -1);
  return w;
}

/**
 * The words of a text: alphanumeric runs, so "5g", "128gb", "s24" and "3d"
 * stay whole. `query`: also what shoppers call things (QUERY_SAME_AS).
 */
function tokenize(text: string, query = false): string[] {
  return text
    .replace(/(\w)'s\b/g, "$1")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (query ? QUERY_SAME_AS[w] : undefined) ?? SAME_AS[w] ?? w);
}

/**
 * The words of a product or category name, as search reads them: compounds
 * one ("T-Shirt" → "tshirt"), possessives off, whom-for in one spelling
 * ("Woman Jeans" → "women jeans"). The lexicon is built with this
 * (scripts/build_search_lexicon.mjs), so a completion and a query split
 * words the same way.
 */
export function nameWords(text: string): string[] {
  return tokenize(normalizeText(text)).flatMap((w) => w.split(" "));
}

/** The words of what a shopper typed: as nameWords, and what they call things in the catalogue's words ("tws" → "earbuds"). */
export function typedWords(text: string): string[] {
  return tokenize(normalizeText(text), true).flatMap((w) => w.split(" "));
}

/** The head nouns of a category name ("Holders & Stands" → holder, stand). */
export function categoryHeads(name: string): string[] {
  return [...nameHeads(name)];
}

// ---- Budget and quantity ---------------------------------------------------

export interface Budget {
  min?: number;
  max?: number;
  /** A bare price: "around" it. */
  around?: number;
  currency: "INR" | "USD";
  /** As we say it back: "Under ₹10,000". */
  label: string;
}
export interface Quantity {
  value: number;
  unit: string;
  /** "500 pcs". */
  label: string;
}

/** "10000", "10,000", "1,00,000", "10k", "1.5 lakh", "2 crore": the amount. */
function amount(num: string, scale?: string): number {
  const n = Number(num.replace(/,/g, ""));
  if (!Number.isFinite(n)) return NaN;
  const s = (scale ?? "").toLowerCase();
  if (s === "k" || s === "thousand") return n * 1_000;
  if (s === "l" || s.startsWith("lac") || s.startsWith("lakh")) return n * 100_000;
  if (s === "cr" || s.startsWith("crore")) return n * 10_000_000;
  if (s === "million") return n * 1_000_000;
  return n;
}

const NUM = String.raw`(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|l|crores?|cr|million)?\b`;
const CUR = String.raw`(?:inr|rs\.?|rupees?|\$|usd|dollars?)`;
const isUsd = (s: string) => /\$|usd|dollar/.test(s);
const money = (ctx: string, n: number) => (isUsd(ctx) ? `$${n.toLocaleString("en-US")}` : `₹${n.toLocaleString("en-IN")}`);

interface Taken<T> { value: T; text: string }

/** A budget in the text, and the text without it. Only with a money word or a price word: "5000mah" is not a budget. */
function takeBudget(text: string): Taken<Budget> | null {
  const c = `(?:${CUR}\\s*)?`;
  const cAfter = `(?:\\s*${CUR})?`;
  const range = new RegExp(String.raw`(?:between|from|budget(?: of| is)?)?\s*${c}${NUM}${cAfter}\s*(?:-|to|and)\s*${c}${NUM}${cAfter}`, "i");
  const below = new RegExp(String.raw`(?:under|below|less than|lesser than|lower than|within|upto|up to|max(?:imum)?|not more than|no more than|cheaper than|budget(?: of| is)?|around|approx(?:imately)?|about|<=?)\s*${c}${NUM}${cAfter}`, "i");
  const above = new RegExp(String.raw`(?:above|over|more than|greater than|starting(?: from| at)?|min(?:imum)?|at least|>=?)\s*${c}${NUM}${cAfter}`, "i");
  const bare = new RegExp(String.raw`(?:${CUR}\s*${NUM})|(?:${NUM}\s*${CUR})`, "i");

  let m = text.match(range);
  if (m) {
    const lo = amount(m[1], m[2]);
    const hi = amount(m[3], m[4]);
    // Two numbers with a dash are a budget only beside a money word, or when
    // both are price-sized ("2-3 years", "100-200 pcs" and "2l-5l" are not).
    const moneyWord = /inr|rs|rupee|\$|usd|dollar|budget|between|\dk\b|lakh|lac/i.test(m[0]);
    const priceSized = lo >= 500 && hi >= 500 && !/\d\s*l\b/i.test(m[0]);
    if ((moneyWord || priceSized) && lo > 0 && hi > lo && !/\b(pcs|pieces|units|sets)\b/i.test(text.slice(m.index! + m[0].length, m.index! + m[0].length + 8))) {
      return { value: { min: lo, max: hi, currency: isUsd(m[0]) ? "USD" : "INR", label: `${money(m[0], lo)} – ${money(m[0], hi)}` }, text: text.replace(m[0], " ") };
    }
  }
  m = text.match(below);
  if (m) {
    const n = amount(m[1], m[2]);
    if (n > 0) {
      const cur = isUsd(m[0]) ? "USD" : "INR";
      const value: Budget = /around|approx|about/i.test(m[0]) ? { around: n, currency: cur, label: `Around ${money(m[0], n)}` } : { max: n, currency: cur, label: `Under ${money(m[0], n)}` };
      return { value, text: text.replace(m[0], " ") };
    }
  }
  m = text.match(above);
  if (m) {
    const n = amount(m[1], m[2]);
    if (n > 0) return { value: { min: n, currency: isUsd(m[0]) ? "USD" : "INR", label: `Above ${money(m[0], n)}` }, text: text.replace(m[0], " ") };
  }
  m = text.match(bare);
  if (m) {
    const n = amount(m[1] ?? m[3], m[2] ?? m[4]);
    if (n > 0) return { value: { around: n, currency: isUsd(m[0]) ? "USD" : "INR", label: `Around ${money(m[0], n)}` }, text: text.replace(m[0], " ") };
  }
  return null;
}

/** An order quantity ("500 pcs", "moq 100", "2 containers"), and the text without it. */
function takeQuantity(text: string): Taken<Quantity> | null {
  const unit = String.raw`(pcs|pc|pieces?|units?|nos|sets?|pairs?|cartons?|ctns?|boxes|dozens?|containers?|tons?|tonnes?|kgs?)`;
  // A range ("100-200 pcs") is one quantity, from its lower bound.
  const span = text.match(new RegExp(String.raw`\b(\d[\d,]*)\s*(?:-|to)\s*(\d[\d,]*)\s*${unit}\b`, "i"));
  if (span) {
    const lo = Number(span[1].replace(/,/g, ""));
    const hi = Number(span[2].replace(/,/g, ""));
    const su = span[3].toLowerCase();
    const spanUnit = /^(pc|pcs|pieces?|nos|units?)$/.test(su) ? "pcs" : su;
    if (lo >= 10 && hi > lo) {
      return { value: { value: lo, unit: spanUnit, label: `${lo.toLocaleString("en-IN")}–${hi.toLocaleString("en-IN")} ${spanUnit}` }, text: text.replace(span[0], " ") };
    }
  }
  const m =
    text.match(new RegExp(String.raw`\b(?:moq|qty|quantity|minimum order)\s*(?:of|is|:)?\s*(\d[\d,]*)\s*${unit}?\b`, "i")) ??
    text.match(new RegExp(String.raw`\b(\d[\d,]*)\s*${unit}\b`, "i"));
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ""));
  const u = (m[2] ?? "pcs").toLowerCase();
  // "3 piece suit" and "2 pcs set" describe the product; an order is
  // bigger, comes by the container, or says it is a quantity.
  const isOrder = value >= 10 || /container|ton|carton|ctn/.test(u) || /moq|qty|quantity|minimum/i.test(m[0]);
  if (!value || !isOrder) return null;
  const unitLabel = /^(pc|pcs|pieces?|nos|units?)$/.test(u) ? "pcs" : u;
  return { value: { value, unit: unitLabel, label: `${value.toLocaleString("en-IN")} ${unitLabel}` }, text: text.replace(m[0], " ") };
}

// ---- The query -------------------------------------------------------------

export interface QueryIntent {
  raw: string;
  /** What is left to match ("mobile phones"). */
  text: string;
  /** The words to match, in order, filler and grammar gone ("mobile", "phones"). */
  words: string[];
  /** Their stems, for category names ("mobile", "phone"). */
  stems: string[];
  /** The head noun's stem: the thing asked for ("phone" in "mobile phone", "case" in "case for iphone"). */
  head: string | null;
  budget: Budget | null;
  quantity: Quantity | null;
  /** Nothing left to match: the text was all filler, or only a budget. */
  empty: boolean;
}

/** The head noun: the last content word before a preposition, or the last one; numbers and whom-for skipped. */
function headOf(tokens: string[]): string | null {
  const cut = tokens.findIndex((t, i) => i > 0 && PREPOSITIONS.has(t));
  const span = (cut > 0 ? tokens.slice(0, cut) : tokens).filter((t) => !STOP.has(t) && !FILLER.has(t));
  for (let i = span.length - 1; i >= 0; i--) {
    const t = span[i];
    if (/\d/.test(t) || AUDIENCE.has(t) || QUALIFIER_AUDIENCE.has(stem(t))) continue;
    return stem(t);
  }
  return null;
}

function fromTokens(tokens: string[]): Pick<QueryIntent, "text" | "words" | "stems" | "head" | "empty"> {
  const kept = tokens.filter((t) => !STOP.has(t) && !FILLER.has(t) && (t.length >= 2 || /\d/.test(t)));
  return { text: kept.join(" "), words: kept, stems: kept.map(stem), head: headOf(tokens), empty: kept.length === 0 };
}

export function understandQuery(raw: string | null | undefined): QueryIntent {
  const rawText = (raw ?? "").replace(/\s+/g, " ").trim();
  let text = normalizeText(rawText).replace(/\b(?:made in|from)\s+(?:china|india)\b/g, " ");
  const budget = takeBudget(text);
  if (budget) text = budget.text;
  const quantity = takeQuantity(text);
  if (quantity) text = quantity.text;
  const tokens = tokenize(text, true).flatMap((w) => w.split(" "));
  return { raw: rawText, budget: budget?.value ?? null, quantity: quantity?.value ?? null, ...fromTokens(tokens) };
}

/** A word and everything that means the same for matching (GROUPS). */
export function equivalents(word: string): string[] {
  const out = new Set([word]);
  const s = stem(word);
  for (const [w, set] of EQUIVALENT) if (w === word || stem(w) === s) for (const x of set) out.add(x);
  return [...out];
}

/**
 * Does a word only describe the thing — its colour, material or cut, whom
 * it is for, a number, a selling word — rather than say what it is? "black"
 * and "men" do; "water" in "black water shoes" does not.
 */
export function isDescriptive(word: string): boolean {
  const s = stem(word);
  return /\d/.test(s) || ATTRIBUTE.has(s) || AUDIENCE.has(s) || GENERIC.has(s) || DECORATIVE.has(s) || STOP.has(s);
}

/** Does the search ask for an accessory itself ("phone case", "laptop charger")? */
export function asksForAccessory(intent: QueryIntent): boolean {
  return intent.words.some((w) => ACCESSORY.has(w) || ACCESSORY.has(stem(w)));
}

/**
 * Should products named after an accessory sink? Only for a device that is
 * asked for as itself ("mobile phone", "laptop", "smartwatch"): there its
 * accessories outnumber it a hundred to one. For anything else they are
 * just words ("long sleeve shirt", "storage box").
 */
export function accessoriesSink(intent: QueryIntent): boolean {
  if (!intent.head || asksForAccessory(intent)) return false;
  return equivalents(intent.head).some((w) => DEVICES.has(w) || DEVICES.has(stem(w)));
}

/** The accessory words, for the product ranking's penalty (searchQuery). */
export const ACCESSORY_TERMS: readonly string[] = ACCESSORY_WORDS;

// ---- Typos -----------------------------------------------------------------

/** Damerau-Levenshtein (optimal string alignment) distance, given up past `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

export interface Vocabulary {
  has(word: string): boolean;
  /** Words long enough to correct to, by first letter, most frequent first. */
  byLetter: Map<string, string[]>;
}

/** The catalogue's words, most frequent first (searchVocabulary.ts), plus the category names' words. */
export function buildVocabulary(frequent: readonly string[], extra: readonly string[] = []): Vocabulary {
  const set = new Set<string>([...frequent, ...extra]);
  for (const g of GROUPS) for (const w of g) set.add(w);
  for (const [k, v] of [...Object.entries(SAME_AS), ...Object.entries(QUERY_SAME_AS)]) { set.add(k); set.add(v); }
  for (const k of Object.keys(BROADER)) set.add(k);
  for (const w of [...FILLER, ...STOP]) set.add(w);
  const byLetter = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const w of [...frequent, ...extra]) {
    if (w.length < 3 || /\d/.test(w) || seen.has(w)) continue;
    seen.add(w);
    if (!byLetter.has(w[0])) byLetter.set(w[0], []);
    byLetter.get(w[0])!.push(w);
  }
  return { has: (w) => set.has(w) || set.has(stem(w)), byLetter };
}

/**
 * Words the catalogue does not know, corrected to the nearest it does
 * ("moblie" → "mobile", "headphnes" → "headphones", "bluetoth" →
 * "bluetooth"): one edit up to six letters, two from seven, the commoner
 * word on a tie, a word starting with the same letter first. Left alone: the
 * word still being typed (`skipLast`, autocomplete) while it can still grow
 * into a word, numbers, models, and anything under four letters.
 */
export function correctWords(intent: QueryIntent, vocab: Vocabulary, skipLast = false): { intent: QueryIntent; corrected: boolean } {
  let corrected = false;
  // The word being typed is left alone only while it can still become a
  // word ("earb" → earbuds); "speker" can become none, so it is a typo.
  const growing = (w: string) => (vocab.byLetter.get(w[0]) ?? []).some((c) => c.length > w.length && c.startsWith(w));
  const fixed = intent.words.map((w, i) => {
    if ((skipLast && i === intent.words.length - 1 && growing(w)) || w.length < 4 || /\d/.test(w) || vocab.has(w)) return w;
    const max = w.length >= 7 ? 2 : 1;
    let best: string | null = null;
    let bestD = max + 1;
    const same = vocab.byLetter.get(w[0]) ?? [];
    for (const pool of [same, ...[...vocab.byLetter.entries()].filter(([k]) => k !== w[0]).map(([, v]) => v)]) {
      for (const c of pool) {
        if (Math.abs(c.length - w.length) > max) continue;
        const d = distance(w, c, bestD - 1);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best && pool === same) break;
    }
    if (!best) return w;
    corrected = true;
    return QUERY_SAME_AS[best] ?? SAME_AS[best] ?? best;
  });
  if (!corrected) return { intent, corrected };
  return { corrected, intent: { ...intent, ...fromTokens(fixed.flatMap((w) => w.split(" "))) } };
}


// ---- Categories ------------------------------------------------------------

export interface CategoryInput {
  id: string;
  name: string;
  parentId: string | null;
  /** Products attached to this category itself. */
  own: number;
}

interface IndexedCategory extends CategoryInput {
  ownStems: Set<string>;
  heads: Set<string>;
  /** Every word of every ancestor's name. */
  pathStems: Set<string>;
  /** The heads of ancestors that are one kind of thing ("Mobile Phones", not "Phones & Accessories"). */
  pathHeads: Set<string>;
  path: string[];
  /** Products in it and everything under it. */
  total: number;
  /** It and every category under it that holds products: where a search in it reads. */
  subtree: string[];
}

export interface CategoryIndex {
  byId: Map<string, IndexedCategory>;
  all: IndexedCategory[];
  /** Every word in every category name, for the typo vocabulary. */
  words: string[];
}

/** Marketing words in category names that do not make a different thing ("Fashion Backpacks" are backpacks). */
const DECORATIVE = new Set(["fashion", "casual", "style", "stylish", "trendy", "classic", "hot", "popular", "cute", "simple", "elegant", "luxury", "premium", "creative", "basic", "lovers"]);

/** Colours, materials, sizes and ages: they describe a thing, they are not it. */
const ATTRIBUTE = new Set([
  "red", "blue", "black", "white", "green", "yellow", "pink", "purple", "gold", "golden", "silver", "brown", "grey", "gray",
  "orange", "beige", "navy", "multicolor", "colorful", "transparent", "clear",
  "leather", "cotton", "silk", "wool", "woolen", "wooden", "wood", "metal", "steel", "stainless", "plastic", "glass",
  "ceramic", "bamboo", "denim", "linen", "velvet", "nylon", "rubber", "aluminium", "aluminum", "copper", "brass",
  "small", "large", "big", "mini", "long", "short", "xl", "xxl", "plus", "size", "year", "years", "yr", "yrs", "month", "months",
  // Patterns, cuts and more materials and colours: how a photo search, or a
  // shopper, describes a thing ("blue floral sleeveless dress").
  "floral", "striped", "plaid", "polka", "dotted", "leopard", "sleeveless", "strapless", "backless", "oversized", "slim",
  "loose", "fitted", "cropped", "straw", "woven", "knit", "knitted", "lace", "mesh", "suede", "canva", "fleece", "padded",
  "quilted", "faux", "pu", "satin", "chiffon", "polyester", "acrylic", "cream", "ivory", "khaki", "maroon", "burgundy",
  "teal", "turquoise", "olive", "camel", "charcoal", "coral", "mint", "lavender", "nude",
  "neon", "pastel", "matte", "glossy", "metallic", "dark",
]);

/** Things that are for children by nature: a "toys" search is not asking for something else by reaching them. */
const FOR_CHILDREN = new Set(["toy", "doll", "stroller", "pram", "crib", "diaper", "nappy", "pacifier", "rattle", "teether", "romper", "plush"]);

function nameTokens(name: string): string[] {
  return tokenize(normalizeText(name).replace(/&/g, " "))
    .flatMap((w) => w.split(" "))
    .filter((w) => !STOP.has(w) && (w.length >= 2 || /\d/.test(w)));
}

/** "Holders & Stands" → holder, stand; "Cases For iPhone 8 & 8 Plus" → case; "Mobile Phone Accessories" → accessory. */
function nameHeads(name: string): Set<string> {
  const before = normalizeText(name).split(/\s+(?:for|with|of|in)\s+/)[0];
  const heads = new Set<string>();
  for (const part of before.split(/\s*&\s*|\s*,\s*|\s+and\s+/)) {
    const ws = tokenize(part).flatMap((w) => w.split(" ")).filter((w) => !/\d/.test(w));
    if (ws.length) heads.add(stem(ws[ws.length - 1]));
  }
  return heads;
}

export function buildCategoryIndex(categories: readonly CategoryInput[]): CategoryIndex {
  const byId = new Map<string, IndexedCategory>();
  const vocab = new Set<string>();
  for (const c of categories) {
    const toks = nameTokens(c.name);
    for (const t of toks) vocab.add(t);
    byId.set(c.id, {
      ...c, ownStems: new Set(toks.map(stem)), heads: nameHeads(c.name),
      pathStems: new Set(), pathHeads: new Set(), path: [], total: c.own, subtree: [],
    });
  }
  const kids = new Map<string, IndexedCategory[]>();
  for (const c of byId.values()) {
    if (!c.parentId || !byId.has(c.parentId)) continue;
    if (!kids.has(c.parentId)) kids.set(c.parentId, []);
    kids.get(c.parentId)!.push(c);
  }
  const walk = (c: IndexedCategory, ancestors: IndexedCategory[]) => {
    c.path = ancestors.map((a) => a.name);
    for (const a of ancestors) {
      for (const s of a.ownStems) c.pathStems.add(s);
      if (a.heads.size === 1) for (const h of a.heads) c.pathHeads.add(h);
    }
    let total = c.own;
    const subtree = c.own > 0 ? [c.id] : [];
    for (const k of kids.get(c.id) ?? []) {
      walk(k, [...ancestors, c]);
      total += k.total;
      subtree.push(...k.subtree);
    }
    c.total = total;
    c.subtree = subtree;
  };
  for (const c of byId.values()) if (!c.parentId || !byId.has(c.parentId)) walk(c, []);
  return { byId, all: [...byId.values()], words: [...vocab] };
}

export interface CategoryHit {
  id: string;
  name: string;
  /** Its ancestors' names, top first. */
  path: string[];
  /** Products in it and under it. */
  total: number;
  /** Where its products are: itself if it holds any, and every descendant that does. */
  subtree: string[];
  score: number;
}

export interface CategoryIntent {
  /** What the words name, with anything as good, largest first ("dress": Lady Dresses, Unisex Dresses, Dresses). */
  primary: CategoryHit[];
  /** Others the words reach, best first, none inside a primary one. */
  related: CategoryHit[];
}

/** Every stem a query word stands for in a category name: itself and its equals, and what it is a kind of. */
function reach(word: string): { same: Set<string>; broader: Set<string> } {
  const same = new Set(equivalents(word).map(stem));
  const broader = new Set<string>();
  for (const w of [word, ...same]) for (const b of BROADER[w] ?? BROADER[stem(w)] ?? []) broader.add(stem(b));
  return { same, broader };
}

/** How much a query word counts toward explaining it: the thing asked for most, a number least. */
function weightOf(s: string, head: string | null): number {
  if (s === head) return 2;
  if (/^\d+$/.test(s)) return 0.25;
  if (/\d/.test(s) || AUDIENCE.has(s) || QUALIFIER_AUDIENCE.has(s) || ATTRIBUTE.has(s) || GENERIC.has(s)) return 0.5;
  return 1;
}

type HeadFit = "same" | "broader" | "kind" | "none" | "other";
const FIT: Record<HeadFit, number> = { same: 0.4, broader: 0.25, kind: 0.3, none: 0, other: -0.15 };
/** Fewer products than this is too few to be the only best match (resolveCategories). */
const FEW_PRODUCTS = 10;

/**
 * Whom a word says a thing is for. Within a family nothing conflicts (a
 * "baby clothes" search is at home under "Toys, Kids & Babies"); across
 * families it does ("Lady Dresses" are not what "girls dress" means).
 */
function audienceOf(s: string): string | null {
  if (s === "men" || s === "man") return "men";
  if (s === "women" || s === "woman" || s === "lady") return "women";
  if (s === "girl") return "girl";
  if (s === "boy") return "boy";
  if (s === "kids" || s === "kid" || s === "baby" || s === "child") return "child";
  if (s === "pet" || s === "dog" || s === "cat") return "pet";
  return null;
}
const COMPATIBLE: Record<string, string[]> = {
  men: ["men"], women: ["women"], girl: ["girl", "child"], boy: ["boy", "child"],
  child: ["child", "girl", "boy"], pet: ["pet"],
};

/** Whom the words ask for ("men's blazer": men), as audienceOf reads them; none for words that say no one. */
export function audiencesAsked(intent: QueryIntent): string[] {
  return [...new Set(intent.stems.map(audienceOf).filter((a): a is string => !!a))];
}

/** How a product's own name says whom it is for. "Baby blue" and "baby pink" are colours; "cat" is left out ("cat eye", "Cat6"). */
const AUDIENCE_NAME_WORDS: Record<string, string[]> = {
  men: ["men", "mens", "man", "male", "males", "gentleman", "gentlemen"],
  women: ["women", "womens", "woman", "ladies", "lady", "female", "females", "maternity"],
  girl: ["girl", "girls"],
  boy: ["boy", "boys"],
  child: ["kid", "kids", "child", "children", "baby(?!\\s+(?:blue|pink))", "babies", "toddler", "toddlers", "infant", "infants"],
  pet: ["pet", "pets", "dog", "dogs", "puppy", "puppies", "kitten"],
};

/**
 * For a search that says whom it is for, what is someone else's: the
 * categories for someone the words did not ask for and for no one they did
 * (their own name or their family's says so, as resolveCategories judges
 * it: Women's Clothing and everything under it for "men's blazer"), as leaf
 * ids, and the words a product's own name would say it with. Whom it asks
 * for, and the compatible ones, are the words that keep a product its place
 * ("Men Women Couple Sneakers" is a man's too). searchScore sets someone
 * else's below the rest: a woman's blazer is not a man's, however well its
 * name matches the other words (the owner's photo of a man in a blue blazer,
 * answered with women's blazers, 2026-10-06). None for a search that says no
 * one.
 */
export function someoneElse(
  asked: string[],
  index: CategoryIndex,
): { leaves: string[]; theirWords: string[]; askedWords: string[] } | null {
  if (!asked.length) return null;
  const fits = (a: string) => asked.some((x) => COMPATIBLE[x].includes(a));
  const theirs = Object.keys(COMPATIBLE).filter((a) => !fits(a));
  if (!theirs.length) return null;
  const leaves = new Set<string>();
  for (const c of index.all) {
    if (c.total === 0) continue;
    const forWhom = [...c.ownStems, ...c.pathStems].map(audienceOf).filter((a): a is string => !!a);
    if (forWhom.length && !forWhom.some(fits)) for (const id of c.subtree) leaves.add(id);
  }
  return {
    leaves: [...leaves],
    theirWords: theirs.flatMap((a) => AUDIENCE_NAME_WORDS[a]),
    askedWords: Object.keys(COMPATIBLE).filter(fits).flatMap((a) => AUDIENCE_NAME_WORDS[a]),
  };
}

/**
 * Which categories the words name, on whole words, never substrings:
 *  - coverage: how much of the query the category explains, the head noun
 *    counting double, and colours, sizes, numbers, whom-for words and
 *    loose words like "accessories" less; a word in its own name counts
 *    whole (0.85 as what the word is a kind of: "sneakers" reaching
 *    "Shoes"), a word only in a parent's name 0.8 ("phone case" reaches
 *    "Silicone Cases", under Phones & Accessories);
 *  - the head noun: the category is the thing asked for ("Silicone Cases"
 *    for "phone case"), what it is a kind of ("Shoes" for "sneakers"), a
 *    kind of it ("Dual SIM Card", under Mobile Phones, for "dual sim
 *    phone"), or something else ("Dress Watches" for "dress"). A loose
 *    head ("car accessories") hands the part to the word before it ("car");
 *  - the rest of its name: heads nothing asked for lose ("Phones &
 *    Accessories" is half accessories), modifiers the query matches gain,
 *    marketing words ("Fashion Backpacks") are neither;
 *  - whom it is for: for someone the shopper did not say ("Pet Dresses" for
 *    "dress", "Backpacks" under Toys, Kids & Babies for "backpack"), or for
 *    someone else than they said ("Lady Dresses" for "girls dress"), it
 *    falls back;
 *  - and, faintly, its size.
 * The category's own name must match a word; empty categories never come
 * back. The best is "primary" when it is the thing asked for (or a kind of
 * it, or what it is a kind of) and explains enough of the query; so is
 * anything within 0.08 of it. Of an ancestor and a descendant both there,
 * the better-scored stays: "Mobile Phones" over "Phones & Accessories" for
 * "mobile phones", "Men's Shoes" over "Casual Shoes" for "men shoes".
 */
export function resolveCategories(intent: QueryIntent, index: CategoryIndex): CategoryIntent {
  if (intent.empty) return { primary: [], related: [] };
  const asked = new Set(intent.stems);
  // A loose head ("car accessories", "kitchen tools") is not the thing: the
  // word before it is.
  let headStem = intent.head;
  if (headStem && GENERIC.has(headStem)) {
    const better = [...intent.stems].reverse().find((s) => !GENERIC.has(s) && !/\d/.test(s) && !AUDIENCE.has(s) && !QUALIFIER_AUDIENCE.has(s) && !ATTRIBUTE.has(s));
    if (better) headStem = better;
  }
  const query = [...asked].map((s) => ({ s, w: weightOf(s, headStem), ...reach(s) }));
  const totalWeight = query.reduce((n, q) => n + q.w, 0);
  const head = headStem ? reach(headStem) : null;
  const askedFor = new Set([...asked].map(audienceOf).filter((a): a is string => !!a));
  const childish = !!headStem && FOR_CHILDREN.has(headStem);
  if (childish) askedFor.add("child");

  interface Scored extends CategoryHit { sure: boolean; precise: boolean; forPets: boolean }
  const hits: Scored[] = [];
  for (const c of index.all) {
    if (c.total === 0) continue;
    let explained = 0;
    let undescribed = 0;
    let described = 0;
    const ownHit = new Set<string>();
    for (const q of query) {
      const same = [...c.ownStems].filter((s) => q.same.has(s));
      const broader = same.length ? [] : [...c.ownStems].filter((s) => q.broader.has(s));
      if (same.length) {
        explained += q.w;
        for (const s of same) ownHit.add(s);
        if (ATTRIBUTE.has(q.s)) described += 1;
      } else if (broader.length) {
        explained += q.w * 0.85;
        for (const s of broader) ownHit.add(s);
      } else if ([...c.pathStems].some((s) => q.same.has(s) || q.broader.has(s))) {
        explained += q.w * 0.8;
      } else if (ATTRIBUTE.has(q.s)) {
        undescribed += q.w;
      }
    }
    if (!ownHit.size) continue;
    // A colour, material, pattern or cut the category's name does not use
    // describes the products in it, not another category ("blue floral
    // sleeveless dress" is Lady Dresses; "red football jersey" is Jerseys),
    // so it does not count against it. One its name does use counts for it
    // (`described`: "leather jacket" is Leather Jackets before Jackets).
    const coverage = explained / Math.max(0.01, totalWeight - undescribed);
    if (coverage < 0.34) continue;

    let fit: HeadFit = "none";
    if (head) {
      if ([...c.heads].some((h) => head.same.has(h))) fit = "same";
      else if ([...c.heads].some((h) => head.broader.has(h))) fit = "broader";
      else if ([...c.pathHeads].some((h) => head.same.has(h))) fit = "kind";
      else if ([...c.heads].some((h) => !GENERIC.has(h))) fit = "other";
    }
    // A loose head of the category's own ("Accessories") says less when it matches.
    const fitBonus = FIT[fit] * (fit === "same" && [...c.heads].every((h) => GENERIC.has(h)) ? 0.5 : 1);
    const loose = [...c.heads].filter((h) => !query.some((q) => q.same.has(h) || q.broader.has(h))).length;
    const modifiers = [...c.ownStems].filter((s) => !c.heads.has(s) && !EMPTY.has(s) && !DECORATIVE.has(s) && !(AUDIENCE.has(s) && !asked.has(s)));
    const modFit = modifiers.length ? modifiers.filter((s) => ownHit.has(s)).length / modifiers.length : 1;
    // A different kind of the same thing: its own modifier is not the
    // query's, and the query's is not in its name ("Nail Dryers" for "hair
    // dryer"; the "Hair" is only in the root's "Health, Beauty & Hair").
    const queryModifiers = query.filter((q) => q.s !== headStem && q.w >= 1);
    const otherKind = modifiers.length > 0 && modFit === 0 && queryModifiers.some((q) => ![...c.ownStems].some((s) => q.same.has(s) || q.broader.has(s)));
    // Whom it is for, by its own name and its family's.
    const forWhom = new Set([...c.ownStems, ...c.pathStems].map(audienceOf).filter((a): a is string => !!a));
    let audience = 0;
    for (const a of forWhom) {
      if (a === "men" || a === "women") {
        // An adult category is only wrong for a shopper who asked for someone else.
        if (askedFor.size && ![...askedFor].some((x) => COMPATIBLE[x].includes(a))) audience = Math.max(audience, 0.15);
      } else if (![...askedFor].some((x) => COMPATIBLE[x].includes(a))) {
        audience = Math.max(audience, 0.25);
      }
    }

    const score = coverage * 0.6 + fitBonus + modFit * 0.1 + described * 0.1 - loose * 0.1 - audience - (otherKind ? 0.15 : 0) + Math.log10(1 + c.total) * 0.01;
    // What the thing is a kind of, but a different kind of it ("Sports Bags",
    // "Digital Gear Bags" for "woven straw handbag"), is not a sure match.
    const sure = (fit === "same" || fit === "kind") ? coverage >= 0.6 : fit === "broader" ? coverage >= 0.75 && modFit === 1 : !head && coverage >= 0.99;
    hits.push({
      id: c.id, name: c.name, path: c.path, total: c.total, subtree: c.subtree, score,
      sure: sure && audience === 0 && !otherKind,
      // It names a narrower kind, and the query names that kind too.
      precise: modifiers.length > 0 && modFit === 1,
      forPets: forWhom.has("pet"),
    });
  }
  hits.sort((a, b) => b.score - a.score || b.total - a.total);
  if (!hits.length) return { primary: [], related: [] };

  const strip = (h: Scored): CategoryHit => ({ id: h.id, name: h.name, path: h.path, total: h.total, subtree: h.subtree, score: h.score });
  const best = hits[0];
  // The best sure match leads, if it is all but the best ("ladies handbag":
  // Women's Crossbody Bags scores highest but is one kind of bag; Women's
  // Luggage & Bags, just behind, is sure).
  const lead = hits.find((h) => h.sure);
  const contenders = lead && lead.score >= 0.8 && lead.score >= best.score - 0.08 ? hits.filter((h) => h.sure && h.score >= lead.score - 0.08) : [];
  // A best match of a handful of products is no place to send a shopper
  // when a far larger category answers nearly as well: "cup" names "Cup"
  // (2 products) exactly, and Drinkware (8,974) as what a cup is. Both
  // lead then, the larger first.
  if (contenders.length && contenders.reduce((n, h) => n + h.total, 0) < FEW_PRODUCTS) {
    for (const h of hits) if (h.total >= FEW_PRODUCTS && h.score >= Math.max(0.7, best.score - 0.25) && !contenders.includes(h)) contenders.push(h);
  }
  // Of an ancestor and a descendant that both qualify, the descendant
  // speaks only when the query names what makes it narrower ("mobile
  // phones": Mobile Phones, not Phones & Accessories); otherwise the
  // ancestor, which holds more of what was asked for ("women bags": Women's
  // Luggage & Bags, not Crossbody Bags; "men shoes": Men's Shoes, not
  // Casual Shoes).
  const within = (a: CategoryHit, b: CategoryHit) => a.subtree.length > 0 && a.subtree.every((id) => b.subtree.includes(id));
  let primary: Scored[] = [];
  for (const h of contenders) {
    const above = primary.filter((p) => within(h, p));
    const below = primary.filter((p) => within(p, h));
    if (above.length) {
      if (h.precise) primary = [...primary.filter((p) => !above.includes(p)), h];
    } else if (below.length) {
      if (!below.every((p) => p.precise)) primary = [...primary.filter((p) => !below.includes(p)), h];
    } else {
      primary.push(h);
    }
  }
  primary.sort((a, b) => b.total - a.total);
  const petsAsked = askedFor.has("pet");
  const related: Scored[] = [];
  for (const h of hits) {
    if (primary.includes(h) || primary.some((p) => within(h, p))) continue;
    // Pets' things never come up unasked; children's may (parents shop).
    if ((h.forPets && !petsAsked) || h.score < 0.5) continue;
    if (related.some((r) => within(h, r))) continue;
    related.push(h);
    if (related.length >= 12) break;
  }
  return { primary: primary.slice(0, 8).map(strip), related: related.map(strip) };
}
