import 'dotenv/config';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { eproloCall } from './client.mjs';
import { isBlockedDeep } from './moderation.mjs';

// Fills the gaps EPROLO's taxonomy leaves in ours, so no EPROLO product has to
// be stored uncategorised.
//
// Three rules, in order:
//   1. An EPROLO category whose name resolves to exactly ONE of our existing
//      categories reuses that category. Nothing is created.
//   2. An EPROLO apparel category that our tree only has gendered variants of
//      ("Hoodies & Sweatshirts" vs our "Man/Woman Hoodies & Sweatshirts") is
//      created as "Unisex <name>" — EPROLO does not tell us a gender and
//      picking one would be a guess.
//   3. Everything else is created under its EPROLO parent.
//
// Created ids are prefixed EPROLO-L1- / EPROLO-L2- so a category minted here is
// always distinguishable from one CJ supplied, and so re-running is idempotent.

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

const norm = (s) =>
  (s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

// Leading gender/age qualifiers our CJ tree uses.
const GENDER = /^(man|mans|men|mens|woman|womans|women|womens|boy|boys|girl|girls|kid|kids|baby|babys|male|female|unisex|ladies|lady)\s+/;
const stripGender = (n) => {
  let out = n;
  while (GENDER.test(out)) out = out.replace(GENDER, '');
  return out.trim();
};

const lvl1 = (await eproloCall('product_type.html')).list;
const lvl2 = await eproloCall('product_type_two.html');

// The 18 parents that product_type.html omits but level-2 rows reference.
const lvl1ById = new Map(lvl1.map((c) => [c.id, { id: c.id, name: c.name }]));
for (const c of lvl2) {
  if (c.waretypeid != null && !lvl1ById.has(c.waretypeid)) {
    lvl1ById.set(c.waretypeid, { id: c.waretypeid, name: c.typename, synthesized: true });
  }
}
console.log(
  `EPROLO taxonomy: ${lvl1.length} level-1 listed, ` +
  `${lvl1ById.size - lvl1.length} recovered from level-2 parents, ` +
  `${lvl2.length} level-2\n`
);

const ours = await prisma.category.findMany({ select: { id: true, name: true, parentName: true } });
const byNorm = new Map();
for (const c of ours) {
  const k = norm(c.name);
  if (!byNorm.has(k)) byNorm.set(k, []);
  byNorm.get(k).push(c);
}
const resolve = (name) => {
  const hits = byNorm.get(norm(name)) || [];
  return hits.length === 1 ? hits[0] : null;
};

// Does our tree carry only gendered variants of this name?
const genderedVariants = (name) => {
  const target = norm(name);
  return ours.filter((c) => {
    const n = norm(c.name);
    return n !== target && stripGender(n) === target;
  });
};

// "Unisex" is only meaningful for apparel whose gender EPROLO has not already
// told us. Two guards, both learned from a dry run that got these wrong:
//
//   - EPROLO files "Dresses" under its own "Women's Clothing". The gender is
//     stated, so prefixing Unisex would contradict the source.
//   - "Accessories" under "Pet Supplies" matched our Baby/Girl/Boy Accessories
//     on name alone. Pet accessories are not gendered apparel.
//
// Where neither applies the plain name is kept: parentName is stored alongside
// it, so "Accessories" under "Pet Supplies" is already unambiguous in the tree.
const APPAREL_PARENT = /cloth|apparel|fashion|shoes|socks|hat|wear|mask/i;
const GENDERED_PARENT = /\b(men|man|women|woman|womens|mens|boy|girl|kid|kids|baby|ladies)\b/i;
const wantsUnisex = (parentName) =>
  !!parentName && APPAREL_PARENT.test(parentName) && !GENDERED_PARENT.test(parentName);

const actions = { reusedL1: [], createdL1: [], reusedL2: [], createdL2: [], unisexL2: [], blocked: [] };
const toCreate = [];

// ---- level 1 ----
const l1Resolved = new Map(); // eprolo level-1 id -> our category id + name
for (const c of lvl1ById.values()) {
  // Moderation gate. A blocked category is never created and never resolved,
  // so 10-ingest.mjs finds no target for its products and skips them outright.
  // This is the check whose absence let EPROLO's "Sex Product" through.
  if (isBlockedDeep(c.name, null)) {
    actions.blocked.push({ level: 1, eproloId: c.id, name: c.name });
    continue;
  }
  const match = resolve(c.name);
  if (match) {
    l1Resolved.set(c.id, { id: match.id, name: match.name });
    actions.reusedL1.push({ eproloId: c.id, eproloName: c.name, ourId: match.id, ourName: match.name });
  } else {
    const id = `EPROLO-L1-${c.id}`;
    l1Resolved.set(c.id, { id, name: c.name });
    toCreate.push({ id, name: c.name, parentId: null, parentName: null });
    actions.createdL1.push({ eproloId: c.id, name: c.name, ourId: id, recovered: !!c.synthesized });
  }
}

// ---- level 2 ----
const l2Resolved = new Map();
for (const c of lvl2) {
  const parent = l1Resolved.get(c.waretypeid) ?? null;
  // Blocked by its own name, or orphaned because its level-1 parent was
  // blocked above — either way it is not created.
  if (isBlockedDeep(c.name, c.typename) || (c.waretypeid != null && !l1Resolved.has(c.waretypeid))) {
    actions.blocked.push({ level: 2, eproloId: c.id, name: c.name, parent: c.typename });
    continue;
  }
  const match = resolve(c.name);
  if (match) {
    l2Resolved.set(c.id, { id: match.id, name: match.name });
    actions.reusedL2.push({ eproloId: c.id, eproloName: c.name, ourId: match.id, ourName: match.name });
    continue;
  }
  const gendered = wantsUnisex(parent?.name) ? genderedVariants(c.name) : [];
  const name = gendered.length ? `Unisex ${c.name}` : c.name;
  const id = `EPROLO-L2-${c.id}`;
  l2Resolved.set(c.id, { id, name });
  toCreate.push({ id, name, parentId: parent?.id ?? null, parentName: parent?.name ?? null });
  const rec = {
    eproloId: c.id, name, ourId: id,
    parent: parent?.name ?? null,
    gendered: gendered.map((g) => g.name),
  };
  actions.createdL2.push(rec);
  if (gendered.length) actions.unisexL2.push(rec);
}

console.log(`BLOCKED by moderation (never created): ${actions.blocked.length}`);
for (const b of actions.blocked) {
  console.log(`  L${b.level} [${b.eproloId}] ${b.name}${b.parent ? `  (under ${b.parent})` : ''}`);
}
console.log();
console.log(`level-1: ${actions.reusedL1.length} reuse ours, ${actions.createdL1.length} to create`);
console.log(`level-2: ${actions.reusedL2.length} reuse ours, ${actions.createdL2.length} to create ` +
  `(${actions.unisexL2.length} of them as "Unisex ...")\n`);

console.log('--- level-1 to create ---');
for (const c of actions.createdL1) {
  console.log(`  ${c.ourId.padEnd(18)} ${c.name}${c.recovered ? '   [recovered from level-2 parents]' : ''}`);
}

console.log('\n--- "Unisex" level-2 (our tree only had gendered variants) ---');
for (const c of actions.unisexL2) {
  console.log(`  ${c.name}  (under ${c.parent})  <- ours: ${c.gendered.join(', ')}`);
}

if (DRY_RUN) {
  console.log(`\n[DRY RUN] would create ${toCreate.length} categories`);
} else {
  for (const c of toCreate) {
    await prisma.category.upsert({
      where: { id: c.id },
      create: c,
      update: { name: c.name, parentId: c.parentId, parentName: c.parentName },
    });
  }
  console.log(`\ncreated/updated ${toCreate.length} categories`);
}

// The resolution table the catalogue run consumes, so mapping logic lives in
// one place and the full run does not re-derive it per product.
//
// Never written on a dry run. It is an input to 10-ingest.mjs and the mapping
// for products already stored, so overwriting it from a "what would happen"
// pass silently rewrites history. A dry run did exactly that once and remapped
// Unisex Dresses — 1,777 products — to a different category id.
//
// It is also not idempotent across runs: once the categories this script
// creates exist, resolve() can match them by name and produce a different
// table than the one that built the current rows. Regenerate deliberately, and
// re-run the ingest afterwards, or not at all.
if (DRY_RUN) {
  console.log('\n[DRY RUN] category-resolution.json left untouched');
  await prisma.$disconnect();
  process.exit(0);
}
fs.writeFileSync(
  'tools/eprolo/category-resolution.json',
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      level1: Object.fromEntries([...l1Resolved].map(([k, v]) => [k, v])),
      level2: Object.fromEntries([...l2Resolved].map(([k, v]) => [k, v])),
      actions,
    },
    null, 2
  )
);
console.log('resolution table -> tools/eprolo/category-resolution.json');

await prisma.$disconnect();
