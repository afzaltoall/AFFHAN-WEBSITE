/**
 * Finding a customer by the number on their card.
 *
 * "Check on AFFHAN-0042" is the whole point of giving customers a number, and
 * the first thing anybody does with one is paste it into a search box. Until
 * this, every search box matched name, phone, email and product and nothing
 * else, so the one string the office actually says out loud was the one string
 * that found nothing.
 *
 * Pure, and client-safe: lib/customerCode.ts talks to the database, this only
 * knows what a number looks like.
 */

/** A query that is asking for one of our numbers: AFFHAN-42, affhan 0042. */
const CODE_QUERY = /^affhan[-\s]?0*(\d+)$/;

/** The number inside AFFHAN-0042, or null for anything that is not one. */
function codeNumber(code?: string | null): number | null {
  const m = code?.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

const strip = (s: string) => s.replace(/[^a-z0-9]/g, "");

/**
 * Does this row match what was typed?
 *
 * Three passes, in order, and each only exists because the one before it is
 * not enough:
 *
 *   1. A query shaped like one of our numbers is answered by the number
 *      alone, and EXACTLY. "AFFHAN-1" means customer one — not the fifty-six
 *      customers whose number happens to begin with a 1, which is what a
 *      substring match returns once the padding is dropped.
 *   2. The plain substring test, exactly as every one of these boxes has
 *      always worked, with the full code in front of the rest so
 *      "AFFHAN-0001" and "0001" both land.
 *   3. The same test with punctuation and spacing removed from both sides,
 *      which is what lets "+91 93443" reach a number stored with different
 *      spacing. It needs two characters: a single one already matches nearly
 *      everything through pass 2, and stripping the spaces out of a haystack
 *      would let it match across the join between two fields.
 *
 * Additive: anything that matched before any of this still matches.
 */
export function searchMatches(haystack: string, query: string, code?: string | null): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const asked = needle.match(CODE_QUERY);
  if (asked) return codeNumber(code) === Number(asked[1]);

  const hay = (code ? `${code} ${haystack}` : haystack).toLowerCase();
  if (hay.includes(needle)) return true;
  const n = strip(needle);
  return n.length >= 2 && strip(hay).includes(n);
}
