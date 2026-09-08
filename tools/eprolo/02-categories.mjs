import { eproloCall } from './client.mjs';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

// Level 1: { root_path, list: [{ id, name, sort, pic }] }
const lvl1Data = await eproloCall('product_type.html');
const lvl1 = lvl1Data.list;

// Level 2 returns the whole set in one call, each row carrying its level-1
// parent as `waretypeid` / `typename`. No per-parent looping needed.
const lvl2 = await eproloCall('product_type_two.html');

console.log(`EPROLO level 1: ${lvl1.length} categories`);
console.log(`EPROLO level 2: ${lvl2.length} categories`);

const parentsSeen = new Set(lvl2.map((c) => c.waretypeid));
const lvl1Ids = new Set(lvl1.map((c) => c.id));
console.log(`Distinct level-1 parents referenced by level 2: ${parentsSeen.size}`);
const orphanParents = [...parentsSeen].filter((p) => !lvl1Ids.has(p));
if (orphanParents.length) {
  const names = orphanParents.map(
    (p) => `${p} (${lvl2.find((c) => c.waretypeid === p)?.typename ?? '?'})`
  );
  console.log(`Level-2 rows whose parent is NOT in the level-1 list: ${names.join(', ')}`);
}
const childless = lvl1.filter((c) => !parentsSeen.has(c.id));
console.log(`Level-1 categories with no children: ${childless.length}${childless.length ? ' -> ' + childless.map((c) => c.name).join(', ') : ''}`);

// ---- Map onto our existing (CJ-derived) Category tree, by name only. ----
const ours = await prisma.category.findMany({
  select: { id: true, name: true, parentId: true, parentName: true },
});
console.log(`\nOur existing categories: ${ours.length}`);

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const oursByNorm = new Map();
for (const c of ours) {
  const k = norm(c.name);
  if (!oursByNorm.has(k)) oursByNorm.set(k, []);
  oursByNorm.get(k).push(c);
}

function classify(eproloCat, level, parentName) {
  const hits = oursByNorm.get(norm(eproloCat.name)) || [];
  return {
    level,
    eproloId: eproloCat.id,
    eproloName: eproloCat.name,
    eproloParentId: eproloCat.waretypeid ?? null,
    eproloParentName: parentName ?? null,
    matchCount: hits.length,
    matches: hits.map((h) => ({ id: h.id, name: h.name, parentName: h.parentName })),
  };
}

const report = [
  ...lvl1.map((c) => classify(c, 1, null)),
  ...lvl2.map((c) => classify(c, 2, c.typename)),
];

const exact = report.filter((r) => r.matchCount === 1);
const ambiguous = report.filter((r) => r.matchCount > 1);
const unmapped = report.filter((r) => r.matchCount === 0);

console.log(`\n=== MAPPING (exact name match, normalised; nothing invented) ===`);
console.log(`Unique match : ${exact.length}`);
console.log(`Ambiguous (same name exists more than once on our side): ${ambiguous.length}`);
console.log(`No match — NEW to us: ${unmapped.length}`);

console.log(`\n--- Level 1 detail (${lvl1.length}) ---`);
for (const r of report.filter((r) => r.level === 1)) {
  const tag = r.matchCount === 1 ? `MATCH -> ${r.matches[0].name} (${r.matches[0].id})`
    : r.matchCount > 1 ? `AMBIGUOUS x${r.matchCount}`
    : 'NEW';
  console.log(`  [${String(r.eproloId).padStart(4)}] ${r.eproloName.padEnd(34)} ${tag}`);
}

console.log(`\n--- Level 2: ambiguous (${ambiguous.filter((r) => r.level === 2).length}) ---`);
for (const r of ambiguous.filter((r) => r.level === 2).slice(0, 25)) {
  console.log(`  [${r.eproloId}] ${r.eproloName} (under ${r.eproloParentName}) -> ${r.matches.map((m) => `${m.name}/${m.parentName ?? 'root'}`).join(' | ')}`);
}

console.log(`\n--- Level 2: first 40 NEW (unmapped) ---`);
for (const r of unmapped.filter((r) => r.level === 2).slice(0, 40)) {
  console.log(`  [${r.eproloId}] ${r.eproloName}  (under ${r.eproloParentName})`);
}

fs.writeFileSync('tools/eprolo/category-mapping.json', JSON.stringify({ lvl1, lvl2, report }, null, 2));
console.log(`\nFull mapping written to tools/eprolo/category-mapping.json`);
await prisma.$disconnect();
