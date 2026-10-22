import "server-only";

// How a supplier's PRODUCTS cell becomes product terms. Ported from the coverage analysis
// (analysis/supplier-coverage/terms.mjs, REPORT.md 2.1), so the matcher reads the 845 cells exactly as the
// analysis measured them.
//
// The cell is free text typed by the team: "Juicer and clothes dryer", "CERMIC TOILET AND WASHBASIN",
// "t:Water bottle", "ANIMAL FEED (DI CALCIUM PHOSPHATE)". In order:
//   1. lower case, accents off; full-width punctuation to ASCII; emoji out; a leading "t:"-style label off;
//   2. bracketed text becomes an entry of its own ("baby products (baby bed rail guard)" is two products);
//   3. split on , ; / | + newlines, "etc", "and so on"; "with ..." dropped as a description of the product
//      before it; then split on " and " and "&";
//   4. misspellings fixed (TYPOS, PHRASE_FIXES: every one seen in the cells), so matching works before the list
//      is cleaned;
//   5. noise words and anything with a digit dropped ("3pcs", "2kg", "wrc26"), except a few that name the
//      product ("a4 paper", "3d");
//   6. each word singular ("bottles" -> "bottle"), except words whose s is not a plural.
// What is left is a term: "silicone baby tableware", "clothes dryer", "food display riser", "hotel amenity".

/** Misspellings in the PRODUCTS column, word for word (whole words only). */
export const TYPOS: Readonly<Record<string, string>> = {
  matres: "mattress",
  mattres: "mattress",
  matress: "mattress",
  ties: "tie",
  cermic: "ceramic",
  neckless: "necklace",
  badmindon: "badminton",
  sreet: "street",
  srew: "screw",
  sreen: "screen",
  seiling: "ceiling",
  ceilling: "ceiling",
  tranceiver: "transceiver",
  babds: "bands",
  bottels: "bottles",
  texitle: "textile",
  fabri: "fabric",
  jerwelry: "jewelry",
  jewellry: "jewelry",
  jewels: "jewelry",
  funiture: "furniture",
  furni: "furniture",
  futness: "fitness",
  vaccuum: "vacuum",
  membarane: "membrane",
  modom: "modem",
  extentsion: "extension",
  kicthen: "kitchen",
  mateirals: "materials",
  mechine: "machine",
  refrector: "reflector",
  samrt: "smart",
  rubic: "rubik",
  wadrobe: "wardrobe",
  woodern: "wooden",
  carnon: "carbon",
  cuttingn: "cutting",
  chian: "chain",
  electrinic: "electronic",
  pendent: "pendant",
  machineries: "machinery",
  opticals: "optical",
};

/** Misspellings that are phrases, or wrong only in context. */
export const PHRASE_FIXES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bcat liters?\b/g, "cat litter"],
  [/\bshuttle ?co(ck|rk)s?\b/g, "shuttlecock"],
  [/\bhouse ?hold\b/g, "household"],
  [/\bt[ -]?shirts?\b/g, "t-shirt"],
  [/\btemper glass\b/g, "tempered glass"],
  [/\bflower plot\b/g, "flower pot"],
  [/\bsolar lightning\b/g, "solar lighting"],
  [/\btubes abd valves\b/g, "tubes and valves"],
  [/\bgym futness\b/g, "gym fitness"],
  [/\bmotobike\b/g, "motorbike"],
  [/\br\.o\b/g, "ro"],
  [/\b3 way\b/g, "three-way"],
  [/\bagr\. machinery\b/g, "agricultural machinery"],
];

/** Words that say nothing about the product. */
export const NOISE: ReadonlySet<string> = new Set([
  "set", "new", "high", "quality", "wholesale", "size", "etc", "item", "product", "related", "all", "kind", "type",
  "various", "other", "also", "normal", "small", "big", "so", "on", "factory", "company", "supplier", "material",
  "series", "style", "piece", "pcs", "of", "for", "with", "the", "a", "an", "in", "to", "and", "or", "any", "each",
  "copy", "random", "brand", "multicolor", "neuve", "use", "used", "x",
]);

/** Tokens with a digit that still name the product ("a4 paper", "3d printer"). */
const KEEP_DIGITS: ReadonlySet<string> = new Set(["a3", "a4", "a5", "3d"]);

/** Words whose final s is not a plural, kept as they are. */
const KEEP_S: ReadonlySet<string> = new Set([
  "glass", "gas", "dress", "mattress", "chess", "class", "grass", "brass", "bus", "lens", "canvas", "series", "news",
  "scissors", "jeans", "pants", "shorts", "trousers", "clothes", "goggles", "tweezers", "pliers", "sunglasses",
  "glasses", "boxers", "earmuffs", "christmas", "plus", "status", "abs",
  "cactus", "octopus", "analysis", "hydraulics", "aerobics", "gymnastics", "athletics", "physics", "tennis",
  "headphones", "stainless", "wireless", "cordless", "less", "us", "its", "his", "this", "yes",
]);

/** Words that, alone before "and"/"&", qualify the noun after it rather than name a product of their own. */
const QUALIFIERS: ReadonlySet<string> = new Set([
  "lady", "man", "men", "woman", "women", "kid", "child", "children", "girl", "boy", "badminton", "plastic", "acetate", "sport", "kitchen",
]);

export function singular(w: string): string {
  if (w.length <= 3 || KEEP_S.has(w)) return w;
  if (/[^aeiou]ies$/.test(w)) return `${w.slice(0, -3)}y`; // batteries -> battery
  if (/(ss|us|is)$/.test(w)) return w;
  if (/(ches|shes|xes|zes|sses)$/.test(w)) return w.slice(0, -2); // brushes -> brush, boxes -> box
  if (/oes$/.test(w) && !/(shoes|toes)$/.test(w)) return w.slice(0, -2); // tomatoes -> tomato
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

/** One entry's words: tokens, typos fixed, noise and numbers out, each singular. */
function wordsOf(part: string): string[] {
  return part
    .replace(/[^a-z0-9'\- ]+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter(Boolean)
    .map((w) => TYPOS[w] ?? w)
    .flatMap((w) => w.split(" "))
    .filter((w) => (!/\d/.test(w) || KEEP_DIGITS.has(w)) && !NOISE.has(w))
    .map(singular)
    .filter((w) => !NOISE.has(w));
}

/** The terms in one PRODUCTS cell, in order, each once. */
export function termsOf(raw: string | null | undefined): string[] {
  if (!raw) return [];
  // Accents off ("décor" -> "decor"): decomposed, then the combining marks dropped.
  let s = String(raw).toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "");
  // Full-width comma, ideographic comma, semicolon, colon and brackets, as Chinese keyboards type them.
  s = s.replace(/，/g, ",").replace(/、/g, ",").replace(/；/g, ";").replace(/：/g, ":").replace(/（/g, "(").replace(/）/g, ")");
  s = s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ");
  s = s.replace(/^\s*[a-z]{1,3}\s*:\s*/, ""); // "t:Water bottle"
  for (const [re, to] of PHRASE_FIXES) s = s.replace(re, to);
  // Bracketed text as entries of their own.
  const pieces: string[] = [];
  s = s.replace(/\(([^)]*)\)?/g, (_, inner: string) => {
    pieces.push(inner);
    return ",";
  });
  pieces.unshift(s);
  const out: string[] = [];
  const push = (words: string[]) => {
    const term = words.join(" ").trim();
    if (term.length > 1 && !out.includes(term)) out.push(term);
  };
  for (const piece of pieces) {
    const hard = piece.split(/[,;/|+\n\r]+|\band so on\b|\betc\.?|\.\s+|\s-\s/).map((p) => p.replace(/\bwith\b.*$/, ""));
    for (const h of hard) {
      const joined = h.split(/&|\band\b/).map(wordsOf);
      joined.forEach((words, i) => {
        // "ladies & kids watch", "badminton and table tennis rackets": a lone qualifier shares the noun after it.
        const next = joined[i + 1];
        push(words.length === 1 && QUALIFIERS.has(words[0]) && next && next.length > 1 ? [words[0], next[next.length - 1]] : words);
      });
    }
  }
  return out;
}
