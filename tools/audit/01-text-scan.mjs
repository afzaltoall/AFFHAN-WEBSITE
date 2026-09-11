// Catalogue-wide text scan for adult / 18+ signals.
//
// Reports only what is CURRENTLY VISIBLE: a hit already hidden by the live
// rules (blocked category, blocked name keyword, blocked id) is not a finding.
//
//   node tools/audit/01-text-scan.mjs
import fs from 'fs';
import { q, close, descText, blockedCategoryIds } from './lib.mjs';
import { isCategoryBlocked, isNameBlocked, isProductIdBlocked } from './rules.mjs';

// Candidate terms, wider than the live blocklist. Anything that fires here is
// triaged by hand before it is added to the real list — the point is to SEE
// what is there, not to block on a guess.
const CANDIDATES = [
  // unambiguous adult
  'sex product','sex toy','sex doll','sex pillow','sex swing','sex pose','dildo','vibrator',
  'masturbat','anal plug','butt plug','cock ring','penis','vagina','clitoris','g-spot',
  'orgasm','bdsm','bondage','fetish','erotic','aphrodisiac','crotchless','open crotch',
  'bodystocking','nipple clamp','handcuff','sm toy','adult toy','adult product','adult game',
  'prostate','anal bead','love egg','jump egg','tongue vibrat','sucking toy','condom',
  'lubricant oil','delay spray','chastity',
  // lingerie / revealing apparel
  'lingerie','babydoll lingerie','teddy lingerie','g-string','gstring','thong panties',
  'bikini','micro bikini','sexy underwear','sexy bra','peephole','cupless','open bust',
  'exposed bust','see through','see-through','sheer mesh','fishnet','garter','suspender belt',
  'nipple cover','nipple sticker','nipple tassel','pasties','breast sticker','breast petal',
  'strip tease','pole dance','negligee','nightie','babydoll','corset','bustier','bralette',
  'camisole','chemise','panties','briefs','thong','g string','underwear','lingeries',
  'temptation','seduc','sultry','provocative','naughty','kinky',
  // swim / beach that is often adult-photographed
  'swimsuit','swimwear','monokini','tankini','beachwear','bathing suit',
];

const rows = await q(`
  SELECT p.id, p.name, p."categoryId", p."supplierSource", c.name AS cat, p.description
  FROM "Product" p LEFT JOIN "Category" c ON c.id = p."categoryId"
`);
console.log(`scanned ${rows.length} products`);

const { blocked } = await blockedCategoryIds(isCategoryBlocked);
console.log(`blocked categories: ${blocked.size}`);

const hits = new Map(); // term -> rows
let visibleCount = 0;
for (const r of rows) {
  const hidden = blocked.has(r.categoryId) || isNameBlocked(r.name) || isProductIdBlocked(r.id) || !r.categoryId;
  if (hidden) continue;
  visibleCount++;
  const n = (r.name || '').toLowerCase();
  for (const t of CANDIDATES) {
    if (n.includes(t)) {
      if (!hits.has(t)) hits.set(t, []);
      hits.get(t).push({ id: r.id, name: r.name, cat: r.cat, catId: r.categoryId, src: r.supplierSource });
    }
  }
}
console.log(`visible products: ${visibleCount}\n`);

const sorted = [...hits.entries()].sort((a, b) => b[1].length - a[1].length);
console.log('TERM'.padEnd(24), 'VISIBLE HITS');
for (const [t, list] of sorted) console.log(t.padEnd(24), list.length);

fs.mkdirSync('tools/audit/out', { recursive: true });
fs.writeFileSync('tools/audit/out/01-text-hits.json',
  JSON.stringify(Object.fromEntries(sorted.map(([t, l]) => [t, l])), null, 1));
console.log('\nwrote tools/audit/out/01-text-hits.json');
await close();
