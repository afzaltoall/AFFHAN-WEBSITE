// Scores every image in a set of categories and writes a ranked queue.
//
//   node tools/audit/03-skin-rank.mjs <tag> <categoryId...>
import fs from 'fs';
import { q, close } from './lib.mjs';
import { skinScore } from './skin.mjs';

const [tag, ...cats] = process.argv.slice(2);
const rows = await q(
  `SELECT id, name, "categoryId", "imageUrl" FROM "Product"
   WHERE "categoryId" = ANY($1) AND "imageUrl" IS NOT NULL ORDER BY id`, [cats]);
console.log(`${tag}: scoring ${rows.length} images`);

const CONC = 24;
const out = [];
let done = 0, failed = 0;
async function worker(list) {
  for (const r of list) {
    try {
      const res = await fetch(r.imageUrl, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error('http ' + res.status);
      const s = await skinScore(Buffer.from(await res.arrayBuffer()));
      out.push({ ...r, ...s });
    } catch { failed++; }
    if (++done % 250 === 0) process.stdout.write(`  ${done}/${rows.length}\r`);
  }
}
const chunks = Array.from({ length: CONC }, (_, i) => rows.filter((_, j) => j % CONC === i));
await Promise.all(chunks.map(worker));

out.sort((a, b) => b.centre - a.centre);
fs.mkdirSync('tools/audit/out', { recursive: true });
fs.writeFileSync(`tools/audit/out/03-skin-${tag}.json`, JSON.stringify(out, null, 1));
console.log(`\nscored ${out.length}, failed ${failed}`);
console.log('centre-skin distribution:');
for (const t of [0.5, 0.4, 0.35, 0.3, 0.25, 0.2]) {
  console.log(`  >= ${t}: ${out.filter((o) => o.centre >= t).length}`);
}
await close();
