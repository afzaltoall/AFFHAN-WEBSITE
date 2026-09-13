import { pool, q } from './lib.mjs';

// Are products recorded in ModerationLog still present in Product?
//
//   node tools/audit/100-moderation-leak-check.mjs
//
// ModerationLog is authoritative for the cron sync, which skips any cjPid
// recorded there. It is NOT consulted by the read paths — /api/rankings and
// /api/products filter on the name regex and blocked categories instead. So a
// row that survives in Product while sitting in ModerationLog is served unless
// one of those other rules happens to catch it.
//
// Found while counting sitemap candidates: 3,167 such rows exist.

const rows = await q(`
  SELECT p.id, p.name, m."flaggedKeyword", p."supplierSource"
  FROM "Product" p JOIN "ModerationLog" m ON m."cjPid" = p."cjPid" LIMIT 12
`);
console.log('  sample of moderated products still present in Product:\n');
for (const r of rows) {
  console.log(`    ${String(r.id).padStart(8)}  [${String(r.flaggedKeyword || '').slice(0, 24).padEnd(24)}]  ${String(r.name).slice(0, 58)}`);
}

const byReason = await q(`
  SELECT m."flaggedKeyword" AS "flaggedKeyword", COUNT(*)::int AS n
  FROM "Product" p JOIN "ModerationLog" m ON m."cjPid" = p."cjPid"
  GROUP BY 1 ORDER BY n DESC LIMIT 10
`);
console.log('\n  grouped by the reason they were moderated:');
for (const r of byReason) console.log(`    ${String(r.n).padStart(6)}  ${r.flaggedKeyword}`);

await pool.end();
