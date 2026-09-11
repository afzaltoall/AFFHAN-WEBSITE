// Append visual-review findings to a single ledger, BY PRODUCT ID.
//
//   node tools/audit/findings.mjs <reason> <productId...>
//
// Ids come straight off the tile labels, so a finding cannot drift when the
// catalogue changes underneath a sheet — which is exactly what happened when
// this took sheet indexes instead.
import fs from 'fs';
import { q, close } from './lib.mjs';

const [reason, ...ids] = process.argv.slice(2);
if (!reason || !ids.length) { console.error('usage: findings.mjs <reason> <productId...>'); process.exit(1); }

const LEDGER = 'tools/audit/out/findings.json';
const ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : [];
const known = new Set(ledger.map((f) => f.id));

const wanted = ids.map(Number);
const rows = await q(
  `SELECT p.id, p.name, p."imageUrl", c.name AS cat
   FROM "Product" p LEFT JOIN "Category" c ON c.id = p."categoryId"
   WHERE p.id = ANY($1)`, [wanted]);
const byId = new Map(rows.map((r) => [r.id, r]));

let added = 0;
for (const id of wanted) {
  const r = byId.get(id);
  if (!r) { console.error(`  !! ${id} not found in Product (already moved?)`); continue; }
  if (known.has(id)) { console.log(`  = ${id} already recorded`); continue; }
  ledger.push({ id, reason, name: r.name, cat: r.cat, imageUrl: r.imageUrl });
  known.add(id);
  added++;
  console.log(`  + ${String(id).padEnd(9)} ${(r.cat || '-').padEnd(18).slice(0, 18)} ${r.name.slice(0, 62)}`);
}
fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
console.log(`+${added}, ledger now ${ledger.length}`);
await close();
