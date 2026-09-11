// Snapshot of what every category circle currently shows, for before/after
// comparison. Replicates lib/categoryTree.ts finalize() exactly, including the
// promotion pass, so the numbers are what the grid renders — not what the
// table happens to store.
//
//   node tools/audit/30-thumb-snapshot.mjs <out.json>
import fs from 'fs';
import { q, close } from './lib.mjs';
import { isCategoryBlocked } from './rules.mjs';

const out = process.argv[2] || 'tools/audit/out/thumbs-snapshot.json';

const cats = await q(`SELECT id,name,"parentId","thumbnailUrl","displayAsTopLevel","displayLabel" FROM "Category"`);
const counts = Object.fromEntries(
  (await q(`SELECT "categoryId" id, count(*)::int c FROM "Product" WHERE "categoryId" IS NOT NULL GROUP BY 1`))
    .map((r) => [r.id, r.c])
);

const byId = new Map(cats.map((c) => [c.id, c]));
const blockedDeep = (id, s = new Set()) => {
  if (s.has(id)) return false;
  s.add(id);
  const c = byId.get(id);
  if (!c) return false;
  return isCategoryBlocked(c.name) || (c.parentId ? blockedDeep(c.parentId, s) : false);
};

const nodes = new Map(cats.filter((c) => !blockedDeep(c.id)).map((c) => [c.id, { ...c, productCount: counts[c.id] || 0, children: [] }]));
const roots = [];
for (const n of nodes.values()) {
  if (n.parentId && nodes.has(n.parentId)) nodes.get(n.parentId).children.push(n);
  else roots.push(n);
}
for (const c of cats.filter((x) => x.displayAsTopLevel)) {
  const o = nodes.get(c.id);
  if (!o || !o.parentId || !nodes.has(o.parentId)) continue;
  roots.push({ ...o, name: o.displayLabel || o.name, __promoted: true });
}

const finalize = (list) => list
  .map((n) => {
    n.children = finalize(n.children || []);
    n.recursive = (n.productCount || 0) + n.children.reduce((s, c) => s + c.recursive, 0);
    n.children.sort((a, b) => b.recursive - a.recursive);
    n.displayThumbnail = n.thumbnailUrl || n.children.find((c) => c.displayThumbnail)?.displayThumbnail || null;
    return n;
  })
  .filter((n) => n.recursive > 0)
  .sort((a, b) => b.recursive - a.recursive);

const tree = finalize(roots);

// Deduplicated by category id, and that is not a detail.
//
// Promotion CLONES a node's whole subtree to the root, so a plain walk visits
// every promoted category twice — once under its real parent, once at the top.
// Counting that way reported 922 "visible categories" and 262 "duplicated
// images" for a tree of 668, because a category sharing an image with itself
// looks exactly like two categories sharing one. The duplication this script
// exists to measure is between DIFFERENT categories.
const all = [];
const seenIds = new Set();
const walk = (n) => {
  if (!seenIds.has(n.id)) { seenIds.add(n.id); all.push(n); }
  n.children.forEach(walk);
};
tree.forEach(walk);

const seen = new Map();
for (const n of all) {
  const k = n.displayThumbnail || '(none)';
  if (!seen.has(k)) seen.set(k, []);
  seen.get(k).push(n.name);
}
const dupes = [...seen.entries()].filter(([, l]) => l.length > 1);

const topDupes = (() => {
  const m = new Map();
  for (const n of tree) {
    const k = n.displayThumbnail || '(none)';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(n.name);
  }
  return [...m.entries()].filter(([, l]) => l.length > 1);
})();

const snapshot = {
  topLevelTiles: tree.length,
  visibleCategories: all.length,
  distinctImagesAll: seen.size,
  duplicatedImagesAll: dupes.length,
  categoriesSharingAnImage: dupes.reduce((s, [, l]) => s + l.length, 0),
  duplicatedAmongTopTiles: topDupes.map(([, l]) => l),
  perCategory: Object.fromEntries(all.map((n) => [n.id, { name: n.name, thumb: n.displayThumbnail, recursive: n.recursive }])),
};
fs.mkdirSync('tools/audit/out', { recursive: true });
fs.writeFileSync(out, JSON.stringify(snapshot, null, 1));
console.log(`top-level tiles            : ${snapshot.topLevelTiles}`);
console.log(`visible categories         : ${snapshot.visibleCategories}`);
console.log(`distinct images            : ${snapshot.distinctImagesAll}`);
console.log(`duplicated images          : ${snapshot.duplicatedImagesAll} (covering ${snapshot.categoriesSharingAnImage} categories)`);
console.log(`duplicated among top tiles : ${snapshot.duplicatedAmongTopTiles.length}`);
for (const l of snapshot.duplicatedAmongTopTiles) console.log(`   ${l.join('  =  ')}`);
console.log(`\nwrote ${out}`);
await close();
