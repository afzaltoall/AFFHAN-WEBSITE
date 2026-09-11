// Renders contact sheets for a category (or an explicit id list) into
// tools/audit/out/sheets/<tag>/ and writes the index->product manifest.
//
//   node tools/audit/02-sheets.mjs cat <categoryId> <tag>
//   node tools/audit/02-sheets.mjs ids <file-with-ids.json> <tag>
import fs from 'fs';
import { q, close } from './lib.mjs';
import { buildSheet, PER_SHEET } from './contact-sheet.mjs';

const [mode, arg, tag] = process.argv.slice(2);
if (!mode || !arg || !tag) { console.error('usage: 02-sheets.mjs cat|ids <arg> <tag>'); process.exit(1); }

let rows;
if (mode === 'cat') {
  rows = await q(
    `SELECT id, name, "imageUrl" FROM "Product" WHERE "categoryId" = $1 ORDER BY id`, [arg]);
} else {
  const ids = JSON.parse(fs.readFileSync(arg, 'utf8'));
  rows = await q(
    `SELECT id, name, "imageUrl" FROM "Product" WHERE id = ANY($1) ORDER BY id`, [ids]);
}
console.log(`${tag}: ${rows.length} products`);

const outDir = `tools/audit/out/sheets/${tag}`;
fs.mkdirSync(outDir, { recursive: true });
const manifest = rows.map((r, i) => ({ idx: i, id: r.id, name: r.name, imageUrl: r.imageUrl }));
fs.writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 1));

for (let s = 0; s * PER_SHEET < rows.length; s++) {
  const slice = manifest.slice(s * PER_SHEET, (s + 1) * PER_SHEET);
  const out = `${outDir}/sheet-${String(s).padStart(3, '0')}.jpg`;
  await buildSheet(slice, out);
  console.log(`  ${out}  (idx ${slice[0].idx}-${slice[slice.length - 1].idx})`);
}
await close();
