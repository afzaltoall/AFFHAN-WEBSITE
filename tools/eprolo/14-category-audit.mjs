import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';

// Audits every category this pipeline created (id LIKE 'EPROLO-%') and looks
// for a pre-existing CJ equivalent. Read-only: it proposes, it never merges.
//
// "Direct" counts are products filed on the category itself; "deep" counts
// include descendants, because CJ's tree hangs products off leaves and an
// EPROLO level-1 node with 0 direct products may still head a populated
// subtree. Judging a category by its direct count alone would call a busy
// parent empty.

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

const THRESHOLD = Number(process.env.THRESHOLD ?? 25);
const BLOCKED_CATS = ['EPROLO-L2-84', 'EPROLO-L2-1236'];

const cats = await q(`SELECT id, name, "parentId", "parentName", "thumbnailUrl" FROM "Category"`);
const counts = new Map(
  (await q(`SELECT "categoryId", count(*)::int AS n FROM "Product"
            WHERE "categoryId" IS NOT NULL GROUP BY 1`)).map((r) => [r.categoryId, r.n])
);

const children = new Map();
for (const c of cats) {
  if (!c.parentId) continue;
  if (!children.has(c.parentId)) children.set(c.parentId, []);
  children.get(c.parentId).push(c.id);
}
const byId = new Map(cats.map((c) => [c.id, c]));
const deepCount = (id, seen = new Set()) => {
  if (seen.has(id)) return 0;
  seen.add(id);
  return (counts.get(id) ?? 0) + (children.get(id) ?? []).reduce((a, c) => a + deepCount(c, seen), 0);
};

const isEprolo = (c) => c.id.startsWith('EPROLO-');
const eproloCats = cats.filter(isEprolo);
const cjCats = cats.filter((c) => !isEprolo(c));

// Normalise for comparison: lowercase, & -> and, strip punctuation, and
// singularise the last word so "Consumer Electronic" meets "Consumer
// Electronics" and "Bag" meets "Bags".
const norm = (s) => (s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const singular = (w) =>
  w.endsWith('ies') ? w.slice(0, -3) + 'y'
  : w.endsWith('ses') || w.endsWith('xes') || w.endsWith('ches') || w.endsWith('shes') ? w.slice(0, -2)
  : w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1)
  : w;
const key = (s) => norm(s).split(' ').map(singular).join(' ');

const cjByKey = new Map();
for (const c of cjCats) {
  const k = key(c.name);
  if (!cjByKey.has(k)) cjByKey.set(k, []);
  cjByKey.get(k).push(c);
}

console.log(`categories total: ${cats.length}  (EPROLO-created: ${eproloCats.length}, CJ: ${cjCats.length})\n`);

const rows = [];
for (const c of eproloCats) {
  const direct = counts.get(c.id) ?? 0;
  const deep = deepCount(c.id);
  const exact = cjByKey.get(key(c.name)) ?? [];

  // Trigram similarity as a second opinion for the non-exact ones.
  const near = exact.length ? [] : (await q(
    `SELECT id, name, "parentName", similarity(name, $1) AS sim
     FROM "Category" WHERE id NOT LIKE 'EPROLO-%' AND similarity(name, $1) > 0.42
     ORDER BY sim DESC LIMIT 3`, [c.name]));

  rows.push({
    id: c.id, name: c.name, parent: c.parentName,
    direct, deep,
    hasThumb: !!c.thumbnailUrl,
    blocked: BLOCKED_CATS.includes(c.id),
    exactMatch: exact.map((e) => `${e.name} [${e.id}] (under ${e.parentName ?? 'root'}, ${deepCount(e.id)} deep)`),
    nearMatch: near.map((n) => `${n.name} [${n.id}] (under ${n.parentName ?? 'root'}, sim ${Number(n.sim).toFixed(2)})`),
  });
}

rows.sort((a, b) => a.deep - b.deep || a.name.localeCompare(b.name));

console.log(`=== EPROLO categories UNDER ${THRESHOLD} products (deep count) ===`);
const small = rows.filter((r) => r.deep < THRESHOLD);
for (const r of small) {
  console.log(`\n  ${r.name}  [${r.id}]${r.blocked ? '   *** MODERATION-BLOCKED ***' : ''}`);
  console.log(`     under=${r.parent ?? 'root'}  direct=${r.direct} deep=${r.deep}  thumbnail=${r.hasThumb ? 'yes' : 'NONE (generic box)'}`);
  if (r.exactMatch.length) console.log(`     EXACT CJ equivalent: ${r.exactMatch.join(' | ')}`);
  else if (r.nearMatch.length) console.log(`     near CJ candidates : ${r.nearMatch.join(' | ')}`);
  else console.log(`     no CJ equivalent found`);
}
console.log(`\n  -> ${small.length} EPROLO categories under ${THRESHOLD}`);

console.log(`\n=== EPROLO categories at or above ${THRESHOLD} ===`);
for (const r of rows.filter((r) => r.deep >= THRESHOLD)) {
  console.log(`  ${String(r.deep).padStart(5)}  ${r.name}  [${r.id}]  thumb=${r.hasThumb ? 'yes' : 'NONE'}` +
    (r.exactMatch.length ? `   EXACT: ${r.exactMatch.join(' | ')}` : ''));
}

console.log(`\n=== thumbnail coverage ===`);
console.log(`  EPROLO categories with no thumbnail: ${eproloCats.filter((c) => !c.thumbnailUrl).length}/${eproloCats.length}`);
console.log(`  CJ categories with no thumbnail    : ${cjCats.filter((c) => !c.thumbnailUrl).length}/${cjCats.length}`);

fs.mkdirSync('tools/eprolo/moderation', { recursive: true });
fs.writeFileSync('tools/eprolo/category-audit.json', JSON.stringify(rows, null, 2));
console.log(`\nfull audit -> tools/eprolo/category-audit.json`);
await pool.end();
