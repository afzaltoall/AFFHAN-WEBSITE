import 'dotenv/config';
import pg from 'pg';

// How heavy are the product images we hotlink?
//
//   node tools/eprolo/34-image-weight.mjs [sample]
//
// next.config.ts sets images.unoptimized, so whatever the supplier uploaded is
// what the browser downloads — we never resize or re-encode. That makes the
// homepage's LCP a lottery: the hero grid is reshuffled at every ISR
// regeneration, so the above-the-fold image is a different file each time, and
// on a 1.6 Mbps connection the difference between a 30 KB and a 900 KB file is
// the difference between a 2s and a 30s LCP. This measures that spread instead
// of guessing at it.

const N = Number(process.argv[2] ?? 60);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const rows = (await pool.query(
  `SELECT "imageUrl", "supplierSource" FROM "Product"
   WHERE "imageUrl" IS NOT NULL ORDER BY random() LIMIT $1`, [N]
)).rows;

const sizes = [];
let failed = 0;
await Promise.all(rows.map(async (r) => {
  try {
    // HEAD is enough for content-length and avoids pulling the bytes.
    const res = await fetch(r.imageUrl, { method: 'HEAD', signal: AbortSignal.timeout(20000) });
    const len = Number(res.headers.get('content-length'));
    if (res.ok && len > 0) sizes.push({ bytes: len, url: r.imageUrl, src: r.supplierSource });
    else failed++;
  } catch { failed++; }
}));

sizes.sort((a, b) => a.bytes - b.bytes);
const kb = (b) => (b / 1024).toFixed(0) + ' KB';
const at = (p) => sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * p))];
// 1.6 Mbps is the Slow 4G profile the LCP probe emulates: 200 KB/s, shared.
const secs = (b) => (b / (1.6 * 1024 * 1024 / 8)).toFixed(1) + 's';

console.log(`sampled ${sizes.length} product images (${failed} unreachable)\n`);
for (const [label, p] of [['min', 0], ['p25', 0.25], ['median', 0.5], ['p75', 0.75], ['p90', 0.9], ['p99', 0.99], ['max', 0.999]]) {
  const s = at(p);
  console.log(`  ${label.padEnd(7)} ${kb(s.bytes).padStart(9)}   ${secs(s.bytes).padStart(7)} alone on Slow 4G   ${s.url.split('/').pop()}`);
}
const total = sizes.reduce((s, x) => s + x.bytes, 0);
console.log(`\n  mean ${kb(total / sizes.length)}`);
console.log(`  over 200 KB: ${sizes.filter((s) => s.bytes > 200 * 1024).length}/${sizes.length}`);
console.log(`  over 500 KB: ${sizes.filter((s) => s.bytes > 500 * 1024).length}/${sizes.length}`);
console.log(`  ratio max/min: ${(sizes[sizes.length - 1].bytes / sizes[0].bytes).toFixed(0)}x`);

await pool.end();
