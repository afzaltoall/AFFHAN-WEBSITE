// The supplier matcher on the real supplier book, with Postgres's own stemming, for the inquiries the coverage
// analysis judged (analysis/supplier-coverage/out/inquiry_matches.csv, REPORT.md Appendix F). Each case is the
// inquired product's exact title; its category comes the way the route finds one for an inquiry whose product
// link is gone: a catalogue product with the same title. Inquiries themselves can be deleted in the console, so
// the tests do not depend on them. Needs DATABASE_URL (the environment or .env); every statement runs in a READ ONLY
// session. Skipped without it.
//   npm run test:supplier-match
import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import pg from "pg";
import { loadIndex, matchInquiry, resolveInquiryCategory, MATCH_SQL } from "../../src/lib/server/supplier-match/match.ts";

const DB_URL = process.env.DATABASE_URL;
const skip = DB_URL ? false : "no DATABASE_URL";
const CLEAN = new Set(JSON.parse(fs.readFileSync(new URL("../../src/lib/server/supplier-match/clean-categories.json", import.meta.url), "utf8")).categories.map((c) => c.id));

let db;
let index;
let queryMs = 0;
const query = async (sql, params) => {
  const t = performance.now();
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    queryMs += performance.now() - t;
  }
};

before(async () => {
  if (skip) return;
  db = new pg.Client({ connectionString: DB_URL, application_name: "supplier-match tests (read-only)" });
  await db.connect();
  await db.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  await db.query("SET statement_timeout = '20s'");
  index = await loadIndex(query);
});
after(async () => {
  await db?.end();
});

async function matchesFor(title) {
  const { category } = await resolveInquiryCategory(query, { productId: null, productName: title });
  return { ...(await matchInquiry(index, { title, category }, CLEAN, query, 10)), category };
}
const top = (r) => JSON.stringify(r.matches.slice(0, 3).map((m) => [m.supplierId, m.term, m.score]));

test("the book loads: 845 suppliers, their terms and synonyms", { skip }, () => {
  assert.equal(index.rows.size, 845);
  assert.ok(index.terms.size > 600, `${index.terms.size} terms`);
  assert.ok(index.texts.length > index.terms.size);
});

// Suppliers are named by their id and their own entry, never by company: the book's names and numbers stay out of
// the repository (see .gitignore). #3 is the silicone-tableware maker REPORT.md names.
test("Silicone Baby Tableware Eat Learning → the silicone baby tableware maker (#3) ranked #1", { skip }, async () => {
  const r = await matchesFor("Silicone Baby Tableware Eat Learning");
  assert.equal(r.matches[0]?.supplierId, 3, top(r));
  assert.match(index.rows.get(3).productsRaw, /silicone baby tableware/i);
  assert.deepEqual(r.matches[0].matchedWords, ["silicone", "baby", "tableware"]);
  assert.equal(r.matches[0].vague, false);
});

test("the carpet filed under Bathroom Storage → a carpet supplier first, by its word", { skip }, async () => {
  const r = await matchesFor("Carpet Light Luxury Abstract Gradient Simple Bedroom Carpet");
  assert.equal(r.matches[0]?.term, "carpet", top(r));
  assert.deepEqual(r.matches[0].matchedWords, ["carpet"]);
});

test("the umbrella filed under Furniture → the umbrella supplier first", { skip }, async () => {
  const r = await matchesFor("   Umbrella Black 130 cm");
  assert.equal(r.category?.name, "Furniture");
  assert.equal(r.matches[0]?.term, "umbrella", top(r));
  assert.match(index.rows.get(r.matches[0].supplierId).productsRaw, /umbrella/i);
});

test("Baby Shower Cap → not the shower-fittings supplier; any shower match would say \"shower\"", { skip }, async () => {
  const r = await matchesFor("Baby Shower Cap Protector");
  assert.deepEqual(r.excluded, ["shower"]);
  for (const m of r.matches) if (/shower/.test(m.term)) assert.ok(m.matchedWords.includes("shower"), JSON.stringify(m));
  assert.ok(!r.matches.some((m) => m.term === "shower"), top(r));
  assert.notEqual(r.matches[0]?.supplierId, 71);
});

test("the takeout box → not the tiffin-box makers", { skip }, async () => {
  const r = await matchesFor("Light Food Salad Fried Rice Takeout Packing Box Disposable Lunch");
  assert.ok(!r.matches.some((m) => m.term === "tiffin box"), top(r));
});

test("the LED tent lamp → not the tent makers", { skip }, async () => {
  const r = await matchesFor("3 In1 Multifunctional Table Lamp Three In One LED Tent Lamp Car Night Light Foldable Emergency Flashlight");
  assert.ok(!r.matches.some((m) => m.term === "tent"), top(r));
});

test("thick-soled wedge slippers → the slipper supplier first, not the shoe-soles material supplier", { skip }, async () => {
  const r = await matchesFor(" Summer New Style Outer Wedge Slippers Women's Thick-Soled Casual Sandals");
  assert.equal(r.matches[0]?.term, "slipper", top(r));
  assert.ok(!r.matches.some((m) => m.term === "sole"), top(r));
});

test("a men's shirt filed under T-Shirts → not the t-shirt-bag (carrier bag) supplier", { skip }, async () => {
  const r = await matchesFor("Men's Contrast Button Down Hollow Out Shirt");
  assert.ok(!r.matches.some((m) => m.term === "t-shirt bag"), top(r));
});

test("an inquiry nobody supplies → an empty list, no error", { skip }, async () => {
  const r = await matchesFor("Decanter");
  assert.deepEqual(r.matches, []);
  assert.equal(r.total, 0);
  assert.equal(r.searchWord, "decanter");
});

test("one inquiry's match costs well under 50 ms on the database and in the code", { skip }, async () => {
  const title = "Silicone Baby Tableware Eat Learning";
  const { category } = await resolveInquiryCategory(query, { productId: null, productName: title });
  // The database's own time for the one matching statement (the network to it is not the matcher's).
  const plan = await query(`EXPLAIN (ANALYZE, FORMAT JSON) ${MATCH_SQL}`, [
    title,
    category ? `${category.parentName ?? ""} ${category.name}`.trim() : "",
    category?.name ?? "",
    index.texts,
  ]);
  const dbMs = plan[0]["QUERY PLAN"][0]["Execution Time"];
  // The code's own time: the whole match less the time spent waiting on the database.
  queryMs = 0;
  const started = performance.now();
  await matchInquiry(index, { title, category }, CLEAN, query, 10);
  const codeMs = performance.now() - started - queryMs;
  console.log(`  matching statement ${dbMs.toFixed(1)} ms on the database; scoring ${codeMs.toFixed(1)} ms in code`);
  assert.ok(dbMs < 50, `${dbMs} ms`);
  assert.ok(codeMs < 50, `${codeMs} ms`);
});
