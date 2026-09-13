import { pool, q } from './lib.mjs';

// Which products are worth putting in a sitemap?
//
//   node tools/audit/99-sitemap-candidates.mjs
//
// A product page is 69% boilerplate — 87 unique words, mostly the name and
// the category path. That is thin by any measure, and submitting a million of
// them is a site-wide quality signal rather than a million chances to rank.
// The exception is products that carry a real description: EPROLO sends one,
// CJ does not. This counts the tiers so the decision is about numbers rather
// than instinct.

const [total] = await q(`SELECT COUNT(*)::int AS n FROM "Product"`);
const bySource = await q(`
  SELECT COALESCE("supplierSource",'(null)') AS src, COUNT(*)::int AS n,
         COUNT("description")::int AS with_desc,
         COUNT(*) FILTER (WHERE length("description") > 200)::int AS rich_desc
  FROM "Product" GROUP BY 1 ORDER BY n DESC
`);
const [blocked] = await q(`SELECT COUNT(*)::int AS n FROM "ModerationLog"`);
const [noImage] = await q(`SELECT COUNT(*)::int AS n FROM "Product" WHERE "imageUrl" IS NULL`);
const [noCat] = await q(`SELECT COUNT(*)::int AS n FROM "Product" WHERE "categoryId" IS NULL`);

console.log('SITEMAP CANDIDATES\n');
console.log(`  products in catalogue        : ${total.n.toLocaleString()}`);
console.log(`  ModerationLog rows (excluded): ${blocked.n.toLocaleString()}`);
console.log(`  without an image             : ${noImage.n.toLocaleString()}`);
console.log(`  without a category           : ${noCat.n.toLocaleString()}`);

console.log('\n  by supplier:');
console.log('    source'.padEnd(18) + 'products'.padStart(12) + 'with description'.padStart(18) + 'description >200 chars'.padStart(24));
for (const r of bySource) {
  console.log('    ' + String(r.src).padEnd(16) + String(r.n).padStart(12).replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
    String(r.with_desc).padStart(18) + String(r.rich_desc).padStart(24));
}

// How many sitemap files each tier would need, at Google's 50k cap.
const files = (n) => Math.ceil(n / 50000);
const rich = bySource.reduce((a, r) => a + r.rich_desc, 0);
const withDesc = bySource.reduce((a, r) => a + r.with_desc, 0);
console.log('\n  sitemap files needed at 50,000 URLs each:');
console.log(`    every product               : ${files(total.n)} files`);
console.log(`    only those with a description: ${files(withDesc)} file(s)  (${withDesc.toLocaleString()} urls)`);
console.log(`    only descriptions >200 chars : ${files(rich)} file(s)  (${rich.toLocaleString()} urls)`);

// Are the blocked ones still present in Product, or already deleted?
const [stillThere] = await q(`
  SELECT COUNT(*)::int AS n FROM "Product" p
  WHERE EXISTS (SELECT 1 FROM "ModerationLog" m WHERE m."cjPid" = p."cjPid")
`);
console.log(`\n  moderated products still in Product: ${stillThere.n.toLocaleString()}`);
console.log('    (a sitemap query must exclude these explicitly if non-zero)');

await pool.end();
