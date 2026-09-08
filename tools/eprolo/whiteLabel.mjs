import fs from 'fs';

// White-label guard for the pipeline scripts, reading its list from the real
// source: src/lib/whiteLabel.ts. Same reasoning as moderation.mjs — a second
// hand-maintained copy is how these lists drift apart, and a guard that
// silently disagrees with the app is worse than none.

const TS_PATH = new URL('../../src/lib/whiteLabel.ts', import.meta.url);
const src = fs.readFileSync(TS_PATH, 'utf8');

function extractArray(name) {
  const start = src.indexOf(`${name} = [`);
  if (start === -1) throw new Error(`whiteLabel.ts: ${name} not found — refusing to run unguarded`);
  const body = src.slice(start + `${name} = [`.length);
  const end = body.indexOf(']');
  if (end === -1) throw new Error(`whiteLabel.ts: ${name} not terminated`);
  // Comments stripped first: they quote example names, and a quoted word in a
  // comment is indistinguishable from an entry to a naive matcher. This bit the
  // moderation parser once already.
  const arrayBody = body.slice(0, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const items = [...arrayBody.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (!items.length) throw new Error(`whiteLabel.ts: ${name} parsed empty — refusing to run unguarded`);
  return items;
}

export const SUPPLIER_NAMES = extractArray('SUPPLIER_NAMES');
const RE = new RegExp(SUPPLIER_NAMES.join('|'), 'i');

export function containsSupplierName(v) {
  return !!v && RE.test(String(v));
}

/// Throws. An S3 key is written once and then lives in URLs and caches; there
/// is no "log it and carry on" that ends well.
export function assertNeutralKey(key, what = 'storage key') {
  if (containsSupplierName(key)) {
    throw new Error(
      `white-label violation: ${what} contains a supplier name -> ${key}\n` +
      `See src/lib/whiteLabel.ts.`
    );
  }
  return key;
}
