// Moves a decided list of products into ModerationLog and deletes them from
// Product.
//
//   node tools/audit/90-move-to-log.mjs <decisions.json>          # dry run
//   node tools/audit/90-move-to-log.mjs <decisions.json> --apply
//
// decisions.json: [{ "id": 123, "reason": "adult-imagery" }, ...]
//
// Every move is driven by an explicit id list written by a review pass, never
// by a rule evaluated at move time. A rule that decides what to delete while it
// deletes cannot be checked before it runs, and this step is the one that
// destroys rows.
//
// Safe to re-run: ids no longer in Product are skipped, and a product already
// recorded in ModerationLog is not logged twice.
import fs from 'fs';
import { q, close } from './lib.mjs';

const file = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!file) { console.error('usage: 90-move-to-log.mjs <decisions.json> [--apply]'); process.exit(1); }

const decisions = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(decisions.map((d) => [d.id, d.reason]));
console.log(`decisions: ${decisions.length}`);

const rows = await q(
  `SELECT p.id, p."cjPid", p.name, c.name AS cat
   FROM "Product" p LEFT JOIN "Category" c ON c.id = p."categoryId"
   WHERE p.id = ANY($1)`,
  [[...byId.keys()]]
);
console.log(`present in Product : ${rows.length}`);
console.log(`already gone       : ${decisions.length - rows.length}`);

const byReason = {};
for (const r of rows) byReason[byId.get(r.id)] = (byReason[byId.get(r.id)] || 0) + 1;
console.log('\nby reason:');
for (const [k, v] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + String(v).padStart(6), k);
}

console.log('\nsample:');
for (const r of rows.slice(0, 12)) {
  console.log('  ', String(r.id).padEnd(8), (r.cat || '-').padEnd(24).slice(0, 24), r.name.slice(0, 70));
}

if (!APPLY) {
  console.log(`\nDRY RUN — nothing changed. Re-run with --apply to move ${rows.length} products.`);
  await close();
  process.exit(0);
}

// Skip anything already logged, so a re-run does not double-write the log.
const logged = new Set(
  (await q(`SELECT "cjPid" FROM "ModerationLog" WHERE "cjPid" = ANY($1)`,
    [rows.map((r) => r.cjPid)])).map((r) => r.cjPid)
);

let moved = 0;
const BATCH = 500;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const fresh = batch.filter((r) => !logged.has(r.cjPid));
  if (fresh.length) {
    const vals = fresh.map((_, j) =>
      `($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4})`).join(',');
    await q(
      `INSERT INTO "ModerationLog" ("cjPid","name","categoryName","flaggedKeyword") VALUES ${vals}`,
      fresh.flatMap((r) => [r.cjPid, r.name, r.cat ?? null, byId.get(r.id)])
    );
  }
  await q(`DELETE FROM "Product" WHERE id = ANY($1)`, [batch.map((r) => r.id)]);
  moved += batch.length;
  process.stdout.write(`  moved ${moved}/${rows.length}\r`);
}
console.log(`\nDone. ${moved} products moved into ModerationLog and removed from Product.`);
await close();
