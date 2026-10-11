/**
 * Patterns for products whose names say what their category is: CJ files some
 * products where they do not belong (a car charger under "VR & AR Devices", a
 * kitchen scale under "Batteries"), and a picture or a ranked product shown
 * under a category's name should be one of that category. The homepage's
 * draws (lib/homeGrid.ts, telling) and the ranking (lib/rankings.ts) prefer a
 * product whose name matches its category's pattern. Postgres regular
 * expressions, case-insensitive (~*).
 */
/** Words that say little of what a kind is ("Smart", "Pet", "Other", "Accessories"), left out of its pattern. */
export const QUALIFIERS = new Set(
  "and for the of with other others accessories accessory supplies supply products product parts part sets set devices device equipment items item care smart home digital electronic electronics pet pets car cars auto man men woman women lady kids kid children baby boy boys girl girls new fashion".split(" "),
);
/** A word as its products' names begin it: batteries batter, cables cable, watches watch, glasses glass. */
const stemOf = (w: string) => (w.endsWith("ies") ? w.slice(0, -3) : /[sxh]es$/.test(w) ? w.slice(0, -2) : /[^su]s$/.test(w) ? w.slice(0, -1) : w);
/** Words that say nothing at all, left out even of a broad pattern. */
const STOPWORDS = new Set("and for the of with other others new".split(" "));
/**
 * A pattern for products whose names say their kind: its telling words, at the
 * start of a word, so "Batteries" finds battery and batteries; a short one
 * whole, so "VR & AR Devices" finds VR and AR but not "Arcade". Empty for a
 * name of qualifiers alone ("Home Electronic Accessories"). Broad, it keeps
 * the qualifiers too: "Smart Home Appliances" finds "Smart WiFi Plug", which
 * "appliance" alone does not.
 */
export function kindPattern(name: string, broad = false) {
  const skip = broad ? STOPWORDS : QUALIFIERS;
  const words = [...new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !skip.has(w)).map(stemOf))];
  return words.length ? `[[:<:]](${words.map((w) => (w.length <= 3 ? `${w}s?[[:>:]]` : w)).join("|")})` : "";
}
