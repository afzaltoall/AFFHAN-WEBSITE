import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';

// Verifies BLOCKED_NAME_KEYWORDS against the live catalogue: what the rule
// hides, what it newly hides, and — the part that matters — that the confirmed
// machine-translation false positives stay visible.
//
// The regex is rebuilt from src/lib/moderation.ts by the same transformation
// blockedNameRegex() applies, so this tests the real rule rather than a
// paraphrase of it.

const ts = fs.readFileSync('src/lib/moderation.ts', 'utf8');
// Strip comments first — they quote example names, and a quoted word in a
// comment is indistinguishable from a real entry otherwise. See the note in
// tools/eprolo/moderation.mjs for what that cost when it was missed.
const parse = (name) =>
  [...ts
    .split(`${name} = [`)[1]
    .split('];')[0]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const KW = parse('BLOCKED_NAME_KEYWORDS');
const toRegex = (list) => `\\y(${list.map((k) => k.replace(/[-\s]/g, '[- ]?')).join('|')})\\y`;

const ADDED = ['sex product', 'sex pose'];
const PRIOR = KW.filter((k) => !ADDED.includes(k));

const regexNow = toRegex(KW);
const regexBefore = toRegex(PRIOR);
const regexAdded = toRegex(ADDED);

console.log(`${KW.length} name keywords in src/lib/moderation.ts`);
for (const a of ADDED) console.log(`  "${a}" present: ${KW.includes(a)}`);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

const count = async (re) =>
  (await q(`SELECT count(*)::int AS n FROM "Product" WHERE name ~* $1`, [re]))[0].n;

console.log('\n=== hidden by the NAME rule ===');
const before = await count(regexBefore);
const now = await count(regexNow);
console.log(`  before additions : ${before}`);
console.log(`  after additions  : ${now}   (+${now - before})`);

console.log('\n=== NEWLY caught (matches an addition, matched nothing before) ===');
const newly = await q(
  `SELECT id, name, "supplierSource" AS src FROM "Product"
   WHERE name ~* $1 AND name !~* $2 ORDER BY id`,
  [regexAdded, regexBefore]
);
for (const r of newly) console.log(`  ${r.src} #${r.id}  ${r.name.slice(0, 90)}`);
console.log(`  -> ${newly.length} newly blocked`);

console.log('\n=== CONFIRMED FALSE POSITIVES — every one must stay VISIBLE ===');
const fps = await q(
  `SELECT id, name, (name ~* $1) AS blocked FROM "Product"
   WHERE name ILIKE '%Sex Track Assembling%'
      OR name ILIKE '%Same Sex Seven Color%'
      OR name ILIKE '%Sex wild violin%'
      OR name ILIKE '%Repair subsidy-Heel%'
      OR name ILIKE '%Opposite-sex Pearl%'
      OR name ILIKE '%Airplane Bottle Opener%'
   ORDER BY id`,
  [regexNow]
);
let wrong = 0;
for (const r of fps) {
  if (r.blocked) wrong++;
  console.log(`  ${r.blocked ? '!! BLOCKED    ' : 'still visible '}  ${r.name.slice(0, 80)}`);
}
console.log(wrong ? `\n  ${wrong} FALSE POSITIVE(S) WRONGLY BLOCKED` : '\n  OK — all confirmed false positives untouched');

console.log('\n=== Unisex safety (must be 0) ===');
console.log(`  Unisex-named products caught: ${
  (await q(`SELECT count(*)::int AS n FROM "Product" WHERE name ILIKE 'unisex%' AND name ~* $1`, [regexNow]))[0].n
}`);

console.log('\n=== the original 66-product scan, re-run ===');
// Same word-boundary net the audit used, split by whether the rule now hides it.
const SCAN = `\\y(sex|sexual)\\y`;
const rows = await q(
  `SELECT p.id, p.name, p."supplierSource" AS src, c.name AS cat,
          (p.name ~* $2) AS blocked_by_name,
          (p."categoryId" IN ('EPROLO-L2-84','EPROLO-L2-1236')) AS blocked_by_category
   FROM "Product" p LEFT JOIN "Category" c ON c.id = p."categoryId"
   WHERE p.name ~* $1 ORDER BY p."supplierSource", p.id`,
  [SCAN, regexNow]
);
const blocked = rows.filter((r) => r.blocked_by_name || r.blocked_by_category);
const remaining = rows.filter((r) => !r.blocked_by_name && !r.blocked_by_category);
console.log(`  total matching /\\y(sex|sexual)\\y/ : ${rows.length}`);
console.log(`  now blocked                       : ${blocked.length}`);
console.log(`  still visible                     : ${remaining.length}`);

console.log('\n  --- now blocked ---');
for (const r of blocked.slice(0, 20)) {
  console.log(`    ${r.src} #${r.id} [${r.blocked_by_name ? 'name' : 'category'}] ${r.name.slice(0, 72)}`);
}
console.log('\n  --- still visible (for your review) ---');
for (const r of remaining) {
  console.log(`    ${r.src} #${r.id} (${r.cat ?? 'no cat'}) ${r.name.slice(0, 72)}`);
}

fs.mkdirSync('tools/eprolo/moderation', { recursive: true });
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const cols = ['id', 'name', 'src', 'cat', 'blocked_by_name', 'blocked_by_category'];
const out = `tools/eprolo/moderation/name-scan-after-keywords-${stamp}.csv`;
fs.writeFileSync(out, [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n'));
console.log(`\nwrote ${rows.length} rows -> ${out}`);

await pool.end();
