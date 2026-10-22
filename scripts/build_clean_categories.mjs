// Build the supplier matcher's table of clean categories.
//
//   node scripts/build_clean_categories.mjs        # writes src/lib/server/supplier-match/clean-categories.json
//
// Read-only on the database (every statement in a READ ONLY session, 20 s timeout each). Run it again when the
// catalogue changes shape (a new import, categories re-filed); the suppliers can change without it.
//
// A category is clean when at least half of its products' titles name it: a title shares a word with the
// category's own name (with its parent's when the name is one word, "T-Shirts > Print"), English-stemmed as the
// search index stems them. Earrings is clean (about 90% of its titles say "earring"); Furniture is not (about 2%:
// its titles say sofa, table, bed frame), nor are the catch-alls (Home Office Storage, about 10%). For a clean
// category the category alone is enough to suggest a supplier whose product it names; for any other, the words
// of the inquired product's title must agree (src/lib/server/supplier-match/match.ts). The threshold and the rule
// are the coverage analysis's (REPORT.md 2.4, variant C).
import "dotenv/config";
import fs from "node:fs";
import pg from "pg";

const OUT = new URL("../src/lib/server/supplier-match/clean-categories.json", import.meta.url);
const THRESHOLD = 0.5;
// Never clean, whatever their titles say: their names do not describe what is filed in them.
const CATCH_ALL = new Set([
  "87CF251F-8D11-4DE0-A154-9694D9858EB3", // Home Storage > Home Office Storage
  "07398ADB-FC5E-4CC4-AD00-EB230E779E88", // Outerwear & Jackets > Blazers
  "79F47CD1-F813-4B4D-8D21-2B35966FBA66", // Sportswear > Sports Accessories
]);

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "build_clean_categories (read-only)" });
await db.connect();
await db.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
await db.query("SET statement_timeout = '20s'");
await db.query("SET lock_timeout = '1s'");

const categories = (await db.query(`SELECT id, name, "parentName", "productCount" FROM "Category" WHERE "productCount" > 0 ORDER BY id`)).rows;
const clean = [];
let checked = 0;
// One statement per category. The label is the category's name, or its parent's with it when the name is one
// word; any word of the label, stemmed, makes the tsquery ('earring', or 'shirt' | 't-shirt' | 'print'), evaluated
// once and matched through the name's full-text index.
const NAMED = `
  SELECT count(*)::int AS n FROM "Product" p
  WHERE p."categoryId" = $1 AND NOT p."isBlockedName"
    AND to_tsvector('english', p.name) @@ (
      SELECT string_agg(quote_literal(lexeme), ' | ')::tsquery
      FROM unnest(to_tsvector('english', CASE WHEN numnode(plainto_tsquery('english', $2)) <= 1 THEN coalesce($3, '') || ' ' || $2 ELSE $2 END))
    )`;
for (const c of categories) {
  if (CATCH_ALL.has(c.id)) continue;
  checked += 1;
  const named = (await db.query(NAMED, [c.id, c.name, c.parentName])).rows[0].n;
  const share = named / c.productCount;
  if (share >= THRESHOLD) clean.push({ id: c.id, path: c.parentName ? `${c.parentName} > ${c.name}` : c.name, share: Math.round(Math.min(share, 1) * 100) / 100 });
  if (checked % 100 === 0) console.log(`  ${checked} categories checked …`);
  await new Promise((r) => setTimeout(r, 25));
}
await db.end();

clean.sort((a, b) => a.path.localeCompare(b.path));
fs.writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      rule: "at least half of the category's titles name it (a word of its name, with its parent's when the name is one word; English stemming)",
      threshold: THRESHOLD,
      generatedAt: new Date().toISOString().slice(0, 10),
      checked,
      categories: clean,
    },
    null,
    2,
  )}\n`,
);
console.log(`${clean.length} clean of ${checked} categories with products → ${OUT.pathname}`);
