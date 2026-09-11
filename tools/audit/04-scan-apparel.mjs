// Scores every product image in the body-imagery-risk part of the tree and
// appends the result to a JSONL checkpoint.
//
//   node tools/audit/04-scan-apparel.mjs
//
// Resumable: re-running skips ids already present in the JSONL, so an
// interrupted run continues instead of starting over.
import fs from 'fs';
import readline from 'readline';
import { q, close } from './lib.mjs';
import { skinScore } from './skin.mjs';

// Roots whose descendants can plausibly show a human body. Home & Garden,
// Electronics, Automotive and the rest are excluded: 600k images that cannot
// contain the problem are 600k fetches that buy nothing.
const RISK_ROOTS = [
  '2FE8A083-5E7B-4179-896D-561EA116F730', // Women's Clothing
  'B8302697-CF47-4211-9BD0-DFE8995AEB30', // Men's Clothing
  '4B397425-26C1-4D0E-B6D2-96B0B03689DB', // Sports & Outdoors
  'EPROLO-L1-24',                          // Fashion & Clothing (EPROLO)
  '2C7D4A0B-1AB2-41EC-8F9E-13DC31B1C902', // Health, Beauty & Hair
  '2837816E-2FEA-4455-845C-6F40C6D70D1E', // Jewelry & Watches (holds Body Jewelry)
];

const OUT = 'tools/audit/out/04-skin-apparel.jsonl';
fs.mkdirSync('tools/audit/out', { recursive: true });

const cats = await q(`SELECT id, name, "parentId" FROM "Category"`);
const kids = new Map();
for (const c of cats) {
  if (!kids.has(c.parentId)) kids.set(c.parentId, []);
  kids.get(c.parentId).push(c);
}
const wanted = new Set();
const walk = (id) => { wanted.add(id); for (const k of kids.get(id) || []) walk(k.id); };
for (const r of RISK_ROOTS) walk(r);
console.log(`risk categories: ${wanted.size}`);

const rows = await q(
  `SELECT id, name, "categoryId", "imageUrl" FROM "Product"
   WHERE "categoryId" = ANY($1) AND "imageUrl" IS NOT NULL ORDER BY id`,
  [[...wanted]]
);
console.log(`candidate images: ${rows.length}`);

// Resume.
const seen = new Set();
if (fs.existsSync(OUT)) {
  const rl = readline.createInterface({ input: fs.createReadStream(OUT), crlfDelay: Infinity });
  for await (const line of rl) { try { seen.add(JSON.parse(line).id); } catch {} }
}
const todo = rows.filter((r) => !seen.has(r.id));
console.log(`already scored: ${seen.size}; to do: ${todo.length}`);

const sink = fs.createWriteStream(OUT, { flags: 'a' });
const CONC = 32;
let done = 0, failed = 0;
const t0 = Date.now();

async function worker(list) {
  for (const r of list) {
    try {
      const res = await fetch(r.imageUrl, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error('http');
      const s = await skinScore(Buffer.from(await res.arrayBuffer()));
      sink.write(JSON.stringify({ id: r.id, c: +s.centre.toFixed(4), s: +s.skin.toFixed(4) }) + '\n');
    } catch { failed++; sink.write(JSON.stringify({ id: r.id, c: -1, s: -1 }) + '\n'); }
    if (++done % 1000 === 0) {
      const rate = done / ((Date.now() - t0) / 1000);
      const eta = Math.round((todo.length - done) / rate / 60);
      process.stdout.write(`  ${done}/${todo.length}  ${rate.toFixed(0)}/s  eta ${eta}m  failed ${failed}\n`);
    }
  }
}
const chunks = Array.from({ length: CONC }, (_, i) => todo.filter((_, j) => j % CONC === i));
await Promise.all(chunks.map(worker));
sink.end();
console.log(`\nDONE. scored ${done - failed}, failed ${failed}`);
await close();
