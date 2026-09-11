// The live moderation rules, read straight out of src/lib/moderation.ts.
//
// Deliberately NOT a hand-copied mirror. tools/eprolo/moderation.mjs is one of
// those and it had already drifted — 47 name keywords against the TS file's
// larger list, and no BLOCKED_PRODUCT_IDS at all — which means every tool
// built on it was auditing a rule set the site does not actually use.
//
// The arrays are plain string literals, so lifting them out with a regex and
// JSON.parse is enough; no TypeScript build is involved.
import fs from 'fs';

const SRC = fs.readFileSync(new URL('../../src/lib/moderation.ts', import.meta.url), 'utf8');

function arrayLiteral(name) {
  const i = SRC.indexOf(`${name} = [`);
  if (i < 0) throw new Error(`array ${name} not found in moderation.ts`);
  const start = SRC.indexOf('[', i);
  let depth = 0, end = -1;
  for (let j = start; j < SRC.length; j++) {
    if (SRC[j] === '[') depth++;
    else if (SRC[j] === ']') { depth--; if (depth === 0) { end = j; break; } }
  }
  const body = SRC.slice(start + 1, end);
  return body
    .replace(/\/\/[^\n]*/g, '')          // line comments
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => JSON.parse(s.replace(/^'(.*)'$/, '"$1"')));
}

function numberSet(name) {
  const i = SRC.indexOf(`${name}: ReadonlySet<number> = new Set([`);
  const start = SRC.indexOf('[', SRC.indexOf('new Set(', i));
  const end = SRC.indexOf(']', start);
  return new Set(
    SRC.slice(start + 1, end).replace(/\/\/[^\n]*/g, '').split(',')
      .map((s) => s.trim()).filter(Boolean).map(Number)
  );
}

export const BLOCKED_CATEGORY_PATTERNS = arrayLiteral('BLOCKED_CATEGORY_PATTERNS');
export const BLOCKED_NAME_KEYWORDS = arrayLiteral('BLOCKED_NAME_KEYWORDS');
export const REVIEW_NAME_TERMS = arrayLiteral('REVIEW_NAME_TERMS');
export const GENERIC_CATEGORY_NAMES = arrayLiteral('GENERIC_CATEGORY_NAMES');
export const BLOCKED_PRODUCT_IDS = numberSet('BLOCKED_PRODUCT_IDS');

export const isCategoryBlocked = (name) =>
  !!name && BLOCKED_CATEGORY_PATTERNS.some((p) => name.trim().toLowerCase().includes(p));
export const isNameBlocked = (name) =>
  !!name && BLOCKED_NAME_KEYWORDS.some((k) => name.toLowerCase().includes(k));
export const isProductIdBlocked = (id) => id != null && BLOCKED_PRODUCT_IDS.has(id);
export const needsReview = (name) =>
  !!name && REVIEW_NAME_TERMS.some((k) => name.toLowerCase().includes(k));
export const isGenericBucket = (name) =>
  !!name && GENERIC_CATEGORY_NAMES.includes(name.trim().toLowerCase());
