import { pool, q } from './lib.mjs';
import { BLOCKED_NAME_KEYWORDS } from './rules.mjs';

// Where the 4-9 seconds in /api/rankings actually goes.
//
//   node tools/audit/95-rankings-explain.mjs
//
// The route is 0.35s without its main query and 4-9s with it, so this runs
// that query's exact shape under EXPLAIN ANALYZE, then again with each
// suspected cost removed, to say which part is responsible rather than
// guessing between the window function and the regex.

// Same construction as blockedNameRegex() in src/lib/moderation.ts.
const regex = `\y(${BLOCKED_NAME_KEYWORDS.map((k) => k.replace(/[-\s]/g, '[- ]?')).join('|')})(?:e?s)?\y`;

const top = await q(`
  SELECT "categoryId" FROM "Product" WHERE "categoryId" IS NOT NULL
  GROUP BY "categoryId" ORDER BY COUNT(*) DESC LIMIT 15
`);
const ids = top.map((r) => r.categoryId);
const inList = ids.map((_, i) => `$${i + 1}`).join(',');

const variants = [
  ['A  as shipped (window + regex)', `
    SELECT "id" FROM (
      SELECT "id", ROW_NUMBER() OVER (PARTITION BY "categoryId" ORDER BY "id" DESC) AS rn
      FROM "Product" WHERE "categoryId" IN (${inList}) AND "name" !~* $${ids.length + 1}
    ) r WHERE rn <= 3`, [...ids, regex]],

  ['B  window, no regex', `
    SELECT "id" FROM (
      SELECT "id", ROW_NUMBER() OVER (PARTITION BY "categoryId" ORDER BY "id" DESC) AS rn
      FROM "Product" WHERE "categoryId" IN (${inList})
    ) r WHERE rn <= 3`, ids],

  ['C  regex, no window (count only)', `
    SELECT COUNT(*) FROM "Product" WHERE "categoryId" IN (${inList}) AND "name" !~* $${ids.length + 1}`,
    [...ids, regex]],

  ['D  LATERAL per category (window replaced)', `
    SELECT p."id" FROM unnest(ARRAY[${inList}]::text[]) AS c(id)
    CROSS JOIN LATERAL (
      SELECT "id" FROM "Product"
      WHERE "categoryId" = c.id AND "name" !~* $${ids.length + 1}
      ORDER BY "id" DESC LIMIT 3
    ) p`, [...ids, regex]],
];

console.log(`EXPLAIN ANALYZE — rankings query shapes over the 15 biggest categories\n`);
console.log(`  regex length: ${regex.length} chars, ${BLOCKED_NAME_KEYWORDS.length} keywords\n`);
for (const [label, sql, params] of variants) {
  try {
    const rows = await q(`EXPLAIN (ANALYZE, BUFFERS, TIMING) ${sql}`, params);
    const text = rows.map((r) => r['QUERY PLAN']).join('\n');
    const time = /Execution Time: ([\d.]+) ms/.exec(text);
    const plan = /Planning Time: ([\d.]+) ms/.exec(text);
    const scanned = [...text.matchAll(/rows=(\d+)/g)].map((m) => Number(m[1]));
    console.log(`  ${label}`);
    console.log(`     execution ${time ? (Number(time[1]) / 1000).toFixed(2) + 's' : '?'}   planning ${plan ? plan[1] + 'ms' : '?'}   widest row estimate ${Math.max(...scanned).toLocaleString()}`);
    const top2 = text.split('\n').filter((l) => /Scan|Sort|WindowAgg|Limit/.test(l)).slice(0, 3);
    for (const l of top2) console.log('       ' + l.trim().slice(0, 110));
  } catch (e) {
    console.log(`  ${label}\n     FAILED: ${e.message.slice(0, 120)}`);
  }
  console.log('');
}

await pool.end();
