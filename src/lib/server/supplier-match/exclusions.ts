import "server-only";

/**
 * Phrases that contain a supplier's word without meaning their product. EDIT HERE, next to synonyms.ts.
 *
 * When the inquired product's title contains one of the phrases, the word does not count as a match: it is taken
 * out of the title before matching, so "Baby Shower Cap" does not reach the shower-fittings supplier and "LED Tent
 * Lamp" does not reach the tent makers. Each entry came from a wrong first suggestion in the coverage analysis's
 * judged sample (REPORT.md Appendix F). Phrases match whole words, case aside; the word is removed in the
 * singular and the plural.
 */
export const EXCLUSIONS: ReadonlyArray<{ readonly phrases: readonly string[]; readonly word: string }> = [
  { phrases: ["baby shower", "shower cap"], word: "shower" },
  { phrases: ["tent lamp", "tent light"], word: "tent" },
  { phrases: ["on bed", "bed table"], word: "bed" },
  // A disposable or takeout lunch box is packaging, not the reusable tiffin a lunch-box maker sells.
  { phrases: ["takeout", "take-out", "take out", "takeaway", "disposable"], word: "lunch" },
  // "Thick-soled sandals" are sandals: "soled" stems to "sole", which is the shoe-soles material supplier's word.
  { phrases: ["soled"], word: "soled" },
];

const escapeRe = (s: string) => s.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
const RULES = EXCLUSIONS.map((rule) => ({
  word: rule.word,
  phrases: rule.phrases.map((p) => new RegExp(`(^|[^a-z0-9])${escapeRe(p)}(?=$|[^a-z0-9])`, "i")),
  remove: new RegExp(`(^|[^a-z0-9])${escapeRe(rule.word)}s?(?=$|[^a-z0-9])`, "gi"),
}));

/** The title with every excluded word taken out, and which words those were. */
export function withoutExcludedWords(title: string): { title: string; excluded: string[] } {
  let out = title;
  const excluded: string[] = [];
  for (const rule of RULES) {
    if (!rule.phrases.some((re) => re.test(title))) continue;
    out = out.replace(rule.remove, "$1 ");
    excluded.push(rule.word);
  }
  return { title: out, excluded };
}
