import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';
import { isNameBlocked, isCategoryBlocked } from './moderation.mjs';

// Product-level moderation audit, catalogue-wide.
//
// The "Sex Product" incident was caught by category name. This one could not
// be: the items sit in "Others" under Fashion & Clothing, a generic bucket
// whose name says nothing about what is in it. Category-level blocking has no
// signal to work with there, so the only thing that can catch it is the product
// name itself.
//
// Read-only. It reports; 22-hide-adult-products.mjs is what acts.

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

// Terms that are unambiguous enough to hide on sight. Deliberately excludes
// bare "sex" and bare "adult" — the earlier scan showed those hit a children's
// building-block toy, jewellery and shoe-repair kits through bad machine
// translation. Multi-word phrases and unambiguous single words only.
const ADULT_TERMS = [
  // explicit garment/《exposure》styling
  'pasties', 'nipple cover', 'nipple sticker', 'nipple pad', 'breast sticker',
  'breast petal', 'crotchless', 'open crotch', 'open-crotch', 'bodystocking',
  'babydoll', 'baby doll lingerie', 'teddy lingerie', 'garter belt', 'g-string',
  'gstring', 'thong panties', 'see through lingerie', 'sheer lingerie',
  'open bust', 'open cup', 'cupless', 'peephole bra', 'micro bikini',
  'open umbilical', 'navel exposed', 'exposed navel', 'underboob',
  // adult products
  'sex toy', 'sex doll', 'sex product', 'sex pose', 'sex pillow', 'sex swing',
  'dildo', 'vibrator', 'masturbat', 'anal plug', 'butt plug', 'cock ring',
  'penis', 'vagina', 'clitoris', 'g-spot', 'orgasm', 'bdsm', 'bondage',
  'nipple clamp', 'erotic', 'fetish', 'aphrodisiac', 'lubricant intimate',
  // suggestive apparel signals that are reliably adult in this catalogue
  'sexy lingerie', 'erotic lingerie', 'temptation lingerie', 'passion suit',
  'perspective lingerie', 'transparent lingerie', 'lace babydoll',
];

// Generic buckets — nothing in the name tells moderation anything.
const GENERIC_NAMES = ['other', 'others', 'misc', 'miscellaneous', 'general', 'uncategorized', 'uncategorised'];

const sqlList = (arr) => arr.map((t) => t.replace(/'/g, "''"));

console.log('=== GENERIC / CATCH-ALL CATEGORIES (both suppliers) ===');
const generic = await q(`
  SELECT c.id, c.name, c."parentName",
         (SELECT count(*)::int FROM "Product" p WHERE p."categoryId" = c.id) AS products
  FROM "Category" c
  WHERE lower(btrim(c.name)) = ANY($1)
  ORDER BY products DESC`, [GENERIC_NAMES]);
console.table(generic);
const genericIds = generic.map((g) => g.id);
console.log(`total products sitting in generic buckets: ${generic.reduce((a, g) => a + g.products, 0)}`);

// ---- catalogue-wide name scan ----
const terms = sqlList(ADULT_TERMS);
const pattern = terms.join('|');

console.log('\n=== CATALOGUE-WIDE name matches (all 1,080,971 products) ===');
const all = await q(`
  SELECT p.id, p.name, p."supplierSource" AS src, p."categoryId",
         c.name AS cat, c."parentName" AS parent, p.category AS supplier_path,
         ($2 = ANY($3::text[])) AS in_generic
  FROM "Product" p LEFT JOIN "Category" c ON c.id = p."categoryId"
  WHERE p.name ~* $1
  ORDER BY p."supplierSource", c.name NULLS LAST, p.id`,
  [pattern, '', genericIds.length ? genericIds : ['']]);

// Which of these are ALREADY hidden by the live rules?
const rows = all.map((r) => ({
  ...r,
  alreadyHiddenByName: isNameBlocked(r.name),
  alreadyHiddenByCat: isCategoryBlocked(r.cat) || isCategoryBlocked(r.parent),
  inGeneric: genericIds.includes(r.categoryId),
}));
const newlyFlagged = rows.filter((r) => !r.alreadyHiddenByName && !r.alreadyHiddenByCat);

console.log(`matched: ${rows.length}`);
console.log(`  already hidden by existing rules: ${rows.length - newlyFlagged.length}`);
console.log(`  NEWLY FLAGGED (visible right now): ${newlyFlagged.length}`);

console.log('\n=== newly flagged, by category ===');
const byCat = {};
for (const r of newlyFlagged) {
  const k = `${r.src} | ${r.parent ?? '-'} > ${r.cat ?? '(none)'}${r.inGeneric ? '  [GENERIC BUCKET]' : ''}`;
  byCat[k] = (byCat[k] ?? 0) + 1;
}
for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);

console.log('\n=== which term caught them (top 20) ===');
const byTerm = {};
for (const r of newlyFlagged) {
  const n = r.name.toLowerCase();
  const hit = ADULT_TERMS.find((t) => n.includes(t)) ?? '(?)';
  byTerm[hit] = (byTerm[hit] ?? 0) + 1;
}
for (const [k, v] of Object.entries(byTerm).sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(v).padStart(4)}  "${k}"`);

console.log('\n=== sample of newly flagged (first 30) ===');
for (const r of newlyFlagged.slice(0, 30)) {
  console.log(`  ${r.src} #${r.id} [${r.cat ?? '-'}] ${r.name.slice(0, 78)}`);
}

fs.mkdirSync('tools/eprolo/moderation', { recursive: true });
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const cols = ['id', 'name', 'src', 'categoryId', 'cat', 'parent', 'supplier_path', 'inGeneric', 'alreadyHiddenByName', 'alreadyHiddenByCat'];
const out = `tools/eprolo/moderation/others-adult-audit-${stamp}.csv`;
fs.writeFileSync(out, [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n'));
console.log(`\nwrote ${rows.length} rows -> ${out}`);
console.log(`newly-flagged ids -> tools/eprolo/moderation/newly-flagged-ids.json`);
fs.writeFileSync('tools/eprolo/moderation/newly-flagged-ids.json', JSON.stringify(newlyFlagged.map((r) => r.id), null, 2));

await pool.end();
