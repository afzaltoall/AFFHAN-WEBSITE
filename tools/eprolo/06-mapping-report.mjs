import 'dotenv/config';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { eproloCall } from './client.mjs';

// Measures the mapping against real products rather than against the taxonomy.
//
// "145 categories unmapped" was never the number that matters — categories are
// not evenly populated, and a single busy one (Hoodies & Sweatshirts) moves the
// product-level figure more than fifty empty ones. So this samples pages spread
// across the whole 649 and reports where those products actually land.

const prisma = new PrismaClient();
const res = JSON.parse(fs.readFileSync('tools/eprolo/category-resolution.json', 'utf8'));

const parseTypeIds = (v) =>
  String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean).map(Number);

// Evenly spaced sample across the catalogue, plus the first pages the pilot used.
const LAST_PAGE = 649;
const SAMPLE = 30;
const pages = [...new Set([
  1, 2, 3,
  ...Array.from({ length: SAMPLE }, (_, i) => Math.max(1, Math.round((i + 0.5) * (LAST_PAGE / SAMPLE)))),
])].sort((a, b) => a - b);

const outcome = { leaf: 0, parentFallback: 0, unmapped: 0 };
const unmappedDetail = new Map();
const fallbackDetail = new Map();
let total = 0;

console.log(`sampling ${pages.length} pages across 1..${LAST_PAGE}\n`);

for (const n of pages) {
  let list;
  try {
    list = await eproloCall('eprolo_product_list.html', { page: String(n) });
  } catch (e) {
    if (/No data/i.test(e.message)) continue;
    throw e;
  }
  for (const p of list) {
    total++;
    const l1id = parseTypeIds(p.wareTypeId)[0];
    const l2id = parseTypeIds(p.wareTypeTwoId)[0];
    const l2 = res.level2[l2id];
    const l1 = res.level1[l1id];

    if (l2) outcome.leaf++;
    else if (l1) {
      outcome.parentFallback++;
      const k = `${l1id} ${l1.name} (level-2 id ${l2id} not in EPROLO's own level-2 list)`;
      fallbackDetail.set(k, (fallbackDetail.get(k) ?? 0) + 1);
    } else {
      outcome.unmapped++;
      const k = `L1=${l1id} L2=${l2id}`;
      unmappedDetail.set(k, (unmappedDetail.get(k) ?? 0) + 1);
    }
  }
  process.stdout.write('.');
}

const pct = (n) => `${((n / total) * 100).toFixed(2)}%`;
console.log(`\n\n===== PRODUCT-LEVEL MAPPING (${total} sampled products) =====`);
console.log(`exact leaf category    : ${outcome.leaf} (${pct(outcome.leaf)})`);
console.log(`parent-level fallback  : ${outcome.parentFallback} (${pct(outcome.parentFallback)})`);
console.log(`NO category at all     : ${outcome.unmapped} (${pct(outcome.unmapped)})`);

if (fallbackDetail.size) {
  console.log('\nparent-level fallbacks by cause:');
  for (const [k, v] of [...fallbackDetail].sort((a, b) => b[1] - a[1])) console.log(`  ${v}x  ${k}`);
}
if (unmappedDetail.size) {
  console.log('\ntruly unmapped by cause:');
  for (const [k, v] of [...unmappedDetail].sort((a, b) => b[1] - a[1])) console.log(`  ${v}x  ${k}`);
}

// Sanity: every category the resolution table points at must really exist.
const ids = [...new Set([
  ...Object.values(res.level1).map((c) => c.id),
  ...Object.values(res.level2).map((c) => c.id),
])];
const present = await prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true } });
const missing = ids.filter((i) => !present.some((p) => p.id === i));
console.log(`\nresolution table points at ${ids.length} categories; ${present.length} exist in DB` +
  (missing.length ? `; MISSING: ${missing.join(', ')}` : '; none missing'));

await prisma.$disconnect();
