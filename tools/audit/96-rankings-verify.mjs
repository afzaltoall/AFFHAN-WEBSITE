import { pool, q } from './lib.mjs';
import { BLOCKED_NAME_KEYWORDS } from './rules.mjs';

// Does the LATERAL rewrite return the SAME products as the window version,
// and how much faster?
//
//   node tools/audit/96-rankings-verify.mjs
//
// Speed is only half of it. A rewrite that is fast and returns different
// products is not a fix, so this compares the two result sets row for row
// before reporting either timing.

const regex = `\y(${BLOCKED_NAME_KEYWORDS.map((k) => k.replace(/[-\s]/g, '[- ]?')).join('|')})(?:e?s)?\y`;
const top = await q(`
  SELECT "categoryId" FROM "Product" WHERE "categoryId" IS NOT NULL
  GROUP BY "categoryId" ORDER BY COUNT(*) DESC LIMIT 15
`);
const ids = top.map((r) => r.categoryId);
const inList = ids.map((_, i) => `$${i + 1}`).join(',');
const P = ids.length + 1;

const OLD = (dir) => `
  SELECT "id", "categoryId", rn FROM (
    SELECT "id", "categoryId",
      ROW_NUMBER() OVER (PARTITION BY "categoryId" ORDER BY "id" ${dir}) AS rn
    FROM "Product"
    WHERE "categoryId" IN (${inList}) AND "name" !~* $${P}
  ) ranked WHERE rn <= 3`;

const NEW = (dir) => `
  SELECT p."id", c."categoryId",
         ROW_NUMBER() OVER (PARTITION BY c."categoryId" ORDER BY p."id" ${dir}) AS rn
  FROM unnest(ARRAY[${inList}]::text[]) AS c("categoryId")
  CROSS JOIN LATERAL (
    SELECT "id" FROM "Product"
    WHERE "categoryId" = c."categoryId" AND "name" !~* $${P}
    ORDER BY "id" ${dir} LIMIT 3
  ) p`;

const key = (rows) => rows
  .map((r) => `${r.categoryId}#${r.rn}=${r.id}`)
  .sort()
  .join('|');

for (const [tab, dir] of [['hot', 'DESC'], ['popular', 'ASC']]) {
  console.log(`\n=== tab "${tab}" (ORDER BY id ${dir}) ===`);

  const t1 = Date.now();
  const oldRows = await q(OLD(dir), [...ids, regex]);
  const oldMs = Date.now() - t1;

  const t2 = Date.now();
  const newRows = await q(NEW(dir), [...ids, regex]);
  const newMs = Date.now() - t2;

  const same = key(oldRows) === key(newRows);
  console.log(`  window version : ${oldMs.toLocaleString()} ms, ${oldRows.length} rows`);
  console.log(`  LATERAL version: ${newMs.toLocaleString()} ms, ${newRows.length} rows`);
  console.log(`  identical results: ${same ? 'YES' : 'NO'}`);
  if (!same) {
    const a = new Set(oldRows.map((r) => `${r.categoryId}#${r.rn}=${r.id}`));
    const b = new Set(newRows.map((r) => `${r.categoryId}#${r.rn}=${r.id}`));
    console.log('    only in window :', [...a].filter((x) => !b.has(x)).slice(0, 5).join(', '));
    console.log('    only in LATERAL:', [...b].filter((x) => !a.has(x)).slice(0, 5).join(', '));
  }
  const speedup = newMs > 0 ? (oldMs / newMs).toFixed(0) : '>1000';
  console.log(`  speedup: ${speedup}x`);
}

await pool.end();
