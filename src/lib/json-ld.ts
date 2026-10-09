/**
 * The text of a <script type="application/ld+json"> block (security audit
 * 2026-10-08, M1).
 *
 * JSON.stringify leaves "<" as it is, so a string holding "</script>" ends the
 * script element early, and whatever follows it runs as HTML on affhan.com,
 * the same origin as the admin console. Supplier text reaches the product
 * page's schema as the supplier wrote it (name, EPROLO description), so that
 * is not hypothetical. Here each of < > & is written as its JSON escape (a
 * backslash, "u", and its code: 003c, 003e, 0026): the JSON means exactly the
 * same to anything that parses it, search engines included, and no HTML
 * parser can find a tag in it. The line and paragraph separators (U+2028,
 * U+2029) are escaped the same way: valid inside JSON strings, but line breaks
 * to older JavaScript parsers.
 *
 * These characters can only occur inside JSON strings, so replacing every one
 * is always safe. Use this for every JSON-LD block; nothing else on the site
 * puts JSON inside a <script>.
 *
 * Kept free of path aliases and of other modules, so tests can load it as it is.
 */

const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), "g");
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), "g");

export function jsonLd(value: object): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEPARATOR, "\\u2028")
    .replace(PARAGRAPH_SEPARATOR, "\\u2029");
}
