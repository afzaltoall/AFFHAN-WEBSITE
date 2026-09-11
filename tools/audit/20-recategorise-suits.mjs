// "Suits & Sets" was holding things that are not suits and not sets.
//
//   node tools/audit/20-recategorise-suits.mjs           # dry run
//   node tools/audit/20-recategorise-suits.mjs --apply
//
// 59 Halloween/cosplay costumes, plus single dresses and single jackets, were
// filed there alongside genuine two-piece sets. Nothing is deleted here — this
// only moves categoryId, and every product stays in the catalogue.
//
// A listing only counts as a genuine set if its own name says so ("... Set",
// "Two-Piece", "Top + Pants"). That test is what keeps "Women's Dress Set with
// Bodycon Slit Skirt" where it is instead of moving it to Dresses on the word
// "dress".
import { q, close } from './lib.mjs';

const SRC = 'EPROLO-L2-158';
const COSTUME_CAT = 'EPROLO-L2-COSTUMES';
const DRESSES = 'EPROLO-L2-104';
const JACKETS = 'EPROLO-L2-155';
const APPLY = process.argv.includes('--apply');

const SET_MARKERS = ['set', 'two-piece', 'two piece', '2 piece', '2pcs', '3 piece', 'pieces', 'suit', '+', '&', 'piece'];
const COSTUME = ['costume', 'cosplay', 'halloween', 'santa', 'elf ', 'witch', 'vampire', 'mascot', 'role play', 'anime', 'performance wear', 'stage performance', 'party costume'];
const DRESS = ['dress', 'gown'];
const JACKET = ['blazer', 'jacket', 'coat', 'cardigan', 'trench'];

// Reads as a single garment even though it contains a set marker, or vice
// versa. Listed explicitly rather than complicating the rule.
const FORCE_KEEP = new Set([
  1212718, // "Blazer Jacket and Chiffon Long Pants" — two pieces, genuinely a set
]);

const rows = await q(`SELECT id, name, "imageUrl" FROM "Product" WHERE "categoryId" = $1 ORDER BY id`, [SRC]);
const isSet = (n) => SET_MARKERS.some((t) => n.includes(t));

const costumes = [], dresses = [], jackets = [];
for (const r of rows) {
  if (FORCE_KEEP.has(r.id)) continue;
  const n = r.name.toLowerCase();
  if (COSTUME.some((t) => n.includes(t))) { costumes.push(r); continue; }
  if (isSet(n)) continue;
  if (DRESS.some((t) => n.includes(t))) dresses.push(r);
  else if (JACKET.some((t) => n.includes(t))) jackets.push(r);
}

console.log(`Suits & Sets holds ${rows.length}`);
console.log(`  -> Costumes & Cosplay : ${costumes.length}`);
console.log(`  -> Unisex Dresses     : ${dresses.length}`);
console.log(`  -> Jackets & Coats    : ${jackets.length}`);
console.log(`  stays as a set        : ${rows.length - costumes.length - dresses.length - jackets.length}`);

if (!APPLY) {
  console.log('\nDRY RUN — nothing changed. Re-run with --apply.');
  await close();
  process.exit(0);
}

// The costume category does not exist in EPROLO's taxonomy; create it once.
const existing = await q(`SELECT id FROM "Category" WHERE id = $1`, [COSTUME_CAT]);
if (!existing.length) {
  const thumb = costumes.find((c) => c.imageUrl)?.imageUrl ?? null;
  await q(
    `INSERT INTO "Category" (id, name, "parentId", "parentName", "thumbnailUrl", "displayAsTopLevel")
     VALUES ($1, $2, $3, $4, $5, false)`,
    [COSTUME_CAT, 'Costumes & Cosplay', 'EPROLO-L1-24', 'Fashion & Clothing', thumb]
  );
  console.log(`created category ${COSTUME_CAT} (thumbnail ${thumb ? 'set' : 'MISSING'})`);
}

for (const [dest, list, label] of [[COSTUME_CAT, costumes, 'costumes'], [DRESSES, dresses, 'dresses'], [JACKETS, jackets, 'jackets']]) {
  if (!list.length) continue;
  await q(`UPDATE "Product" SET "categoryId" = $1 WHERE id = ANY($2)`, [dest, list.map((r) => r.id)]);
  console.log(`moved ${list.length} ${label} -> ${dest}`);
}
console.log('Done.');
await close();
