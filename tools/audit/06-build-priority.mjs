// Builds review sheets for the browsable fashion catalogue, highest-risk
// category first.
//
// Deliberately not the whole catalogue. 512,398 images is 8,000 sheets, which
// is not a review anybody performs. This is the part a customer actually
// browses to, and the part both reports came from.
import fs from 'fs';
import { q, close } from './lib.mjs';
import { buildSheet, PER_SHEET } from './contact-sheet.mjs';

// Ordered by how likely the category is to hold body imagery, so the review
// finds the most offenders soonest and can be stopped honestly at any point.
const ORDER = [
  ['EPROLO-L2-158', 'suits-sets'],
  ['EPROLO-L2-104', 'unisex-dresses'],
  ['FE1DB733-120C-4506-B990-107EAC5E62E5', 'cj-pants'],
  ['EPROLO-L2-161', 'others'],
  ['EPROLO-L2-160', 'unisex-accessories'],
  ['EPROLO-L2-159', 'socks-leggings'],
  ['EPROLO-L2-106', 'unisex-hoodies'],
  ['EPROLO-L2-108', 'unisex-jeans'],
  ['EPROLO-L2-155', 'jackets-coats'],
];

const only = process.argv[2];
for (const [catId, tag] of ORDER) {
  if (only && only !== tag) continue;
  const rows = await q(
    `SELECT id, name, "imageUrl" FROM "Product"
     WHERE "categoryId" = $1 AND "imageUrl" IS NOT NULL ORDER BY id`, [catId]);
  const dir = `tools/audit/out/sheets/${tag}`;
  fs.mkdirSync(dir, { recursive: true });
  const manifest = rows.map((r, i) => ({ idx: i, id: r.id, name: r.name, imageUrl: r.imageUrl }));
  fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 1));
  const sheets = Math.ceil(rows.length / PER_SHEET);
  for (let s = 0; s < sheets; s++) {
    const out = `${dir}/s${String(s).padStart(3, '0')}.jpg`;
    if (fs.existsSync(out)) continue;
    await buildSheet(manifest.slice(s * PER_SHEET, (s + 1) * PER_SHEET), out);
  }
  console.log(`${tag.padEnd(20)} ${String(rows.length).padStart(6)} products -> ${sheets} sheets`);
}
await close();
