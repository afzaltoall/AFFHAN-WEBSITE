// Tier 1 of the moderation decision: products whose NAME alone settles it, plus
// everything sitting in a category that is already blocked as adult.
//
// Nothing ambiguous belongs here. Terms that read as adult but are not were
// checked against the live catalogue and deliberately left out:
//   prostate  - 77 products, every one a health supplement
//   vagina    - 14 products, all feminine-health or medical devices
//   handcuff  - 57 products, all bracelets and pendants
//   peephole  - 17 products, all door-viewer cameras
//   kinky     - 32 products, all hair texture ("kinky curly wig")
//   naughty   - 52 products, cats, dogs and children's nail stickers
//   thong     - 184 products, 92 of them sandals
//   pole dance- 37 products, all high-heeled boots
// Blocking any of those would remove supplements, jewellery and footwear.
import fs from 'fs';
import { q, close } from './lib.mjs';

// Full phrases, matched case-insensitively as substrings of the product name.
const ADULT_PHRASES = [
  'sexy underwear',   // 18 - men's and women's lingerie, all of it
  'lingerie',         //  9 - lingerie sets, bras and panties
  'delay spray',      // 13 - male sexual-performance sprays
  'chastity lock', 'chastity cage', 'chastity device', 'chastity metal belt',
  'cock cage',        // 11 - male chastity hardware
  'exotic condom',    //  2 - "couple toys"
  'sucking toy',      //  1
];

// Individually decided, where no phrase is safe to generalise from.
const ADULT_IDS = new Map([
  [1180202, 'adult-party-game'],   // "Truth Or Dare Bachelor Party Adult Game Card"
  [1047965, 'adult-device'],       // "Vibration Into Beads Ball Soft Beads With Condom"
  // Already in BLOCKED_PRODUCT_IDS and hidden from every list, but still
  // sitting in Product and still served at /products/<id>/.
  [1215583, 'adult-imagery'],
  [1214176, 'adult-imagery'],
  [1211917, 'adult-imagery'],
]);

const decisions = new Map();

// 1. Everything in an adult category. "Sex Product" is EPROLO's own name for
//    it, under two different parents; the API already hides it, but 165 rows
//    are still in Product and still reachable by direct URL.
const catRows = await q(
  `SELECT p.id, c.name AS cat FROM "Product" p JOIN "Category" c ON c.id = p."categoryId"
   WHERE c.name ILIKE '%sex product%' OR c.name ILIKE '%adult product%'
      OR c.name ILIKE '%adult wellness%'`
);
for (const r of catRows) decisions.set(r.id, `adult-category:${r.cat}`);
console.log(`adult categories      : ${catRows.length}`);

// 2. Name phrases.
for (const phrase of ADULT_PHRASES) {
  const rows = await q(`SELECT id FROM "Product" WHERE name ILIKE $1`, [`%${phrase}%`]);
  let added = 0;
  for (const r of rows) if (!decisions.has(r.id)) { decisions.set(r.id, `adult-name:${phrase}`); added++; }
  console.log(`  ${phrase.padEnd(22)}: ${rows.length} matched, ${added} new`);
}

// 3. Individual ids.
for (const [id, reason] of ADULT_IDS) if (!decisions.has(id)) decisions.set(id, reason);

const out = [...decisions].map(([id, reason]) => ({ id, reason }));
fs.writeFileSync('tools/audit/out/decisions-definite.json', JSON.stringify(out, null, 1));
console.log(`\ntotal definite decisions: ${out.length}`);
console.log('wrote tools/audit/out/decisions-definite.json');
await close();
