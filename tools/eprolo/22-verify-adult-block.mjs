import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';

// Confirms the expanded product-name blocklist hides what it should and, just
// as importantly, still shows what it should. Regenerates blockedNameRegex()
// from src/lib/moderation.ts by the same transformation the app applies, so
// this measures the live rule rather than a paraphrase.

const ts = fs.readFileSync('src/lib/moderation.ts', 'utf8');
const parse = (name) =>
  [...ts.split(`${name} = [`)[1].split('];')[0]
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    .matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const KW = parse('BLOCKED_NAME_KEYWORDS');
const regex = `\\y(${KW.map((k) => k.replace(/[-\s]/g, '[- ]?')).join('|')})(?:e?s)?\\y`;
console.log(`${KW.length} name keywords\n`);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

const hidden = (await q(`SELECT count(*)::int n FROM "Product" WHERE name ~* $1`, [regex]))[0].n;
console.log(`products now hidden by the NAME rule: ${hidden}`);

console.log('\n=== the reported items are hidden ===');
const musts = [
  '%Open Umbilical Short Bra%', '%Orgasm Enhancing Lubricant%',
  '%Penis Enlargement%', '%thong panties%', '%Vaginal Tightening%',
  '%Sex Pillow Couples Sex Toys%', '%Sex Toys For Man Realistic%',
];
for (const m of musts) {
  const r = await q(`SELECT name, (name ~* $2) AS blocked FROM "Product" WHERE name ILIKE $1 LIMIT 1`, [m, regex]);
  if (!r.length) { console.log(`  (no product matching ${m})`); continue; }
  console.log(`  ${r[0].blocked ? 'HIDDEN ' : '!! VISIBLE'}  ${r[0].name.slice(0, 74)}`);
}

console.log('\n=== confirmed FALSE POSITIVES must stay visible ===');
const keeps = [
  '%Nursing Breast Pads%', '%Baby casual babydoll%', '%Babydoll Corduroy%',
  '%Office Chair Winter Nipple Pad%', '%Quickly Open Cup%', '%Bridal Lace Garter Belt%',
  '%Bodhi Root Bracelet%', '%Exposed Navel%',
];
let wrong = 0;
for (const m of keeps) {
  const r = await q(`SELECT name, (name ~* $2) AS blocked FROM "Product" WHERE name ILIKE $1 LIMIT 1`, [m, regex]);
  if (!r.length) { console.log(`  (none matching ${m})`); continue; }
  if (r[0].blocked) wrong++;
  console.log(`  ${r[0].blocked ? '!! WRONGLY HIDDEN' : 'visible         '}  ${r[0].name.slice(0, 68)}`);
}
console.log(wrong ? `\n  ${wrong} FALSE POSITIVE(S) WRONGLY HIDDEN` : '\n  OK — no false positive is hidden');

console.log('\n=== what is still visible and adult-ish, for review ===');
const review = await q(`
  SELECT p.id, p.name, c.name AS cat FROM "Product" p LEFT JOIN "Category" c ON c.id=p."categoryId"
  WHERE p.name ~* $1 AND p.name !~* $2 ORDER BY p.id LIMIT 25`,
  ['\\y(vagina|penis|navel|umbilical|garter|babydoll|lingerie|panties|bra)\\y', regex]);
for (const r of review) console.log(`  #${r.id} [${r.cat ?? '-'}] ${r.name.slice(0, 76)}`);
console.log(`  (${review.length} shown)`);

await pool.end();
