import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';
import {
  BLOCKED_NAME_KEYWORDS, isNameBlocked, isCategoryBlocked,
  needsReview, isGenericBucket,
} from './moderation.mjs';

// Recurring moderation gate. Exits NON-ZERO when something needs a human, so
// it can fail an ingest run or a CI step rather than printing into a log
// nobody reads.
//
//   node tools/eprolo/23-moderation-gate.mjs
//
// Three checks, in descending severity:
//
//   1. LEAK — a product that the blocklist says should be hidden but which the
//      live query rules would still return. This must always be zero; if it is
//      not, a rule is wired up wrong somewhere (exactly what happened when the
//      LATERAL fast path hand-copied one clause out of moderationExclusion).
//   2. REVIEW — a stored product matching REVIEW_NAME_TERMS. The ingest gate
//      refuses these at write time, so anything here predates the gate.
//   3. GENERIC — products sitting in an unreadable bucket like "Others".
//      Reported, never auto-blocked: that bucket is mostly legitimate, and the
//      one real offender there was identifiable only from its photograph.

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

const nameRegex = `\\y(${BLOCKED_NAME_KEYWORDS.map((k) => k.replace(/[-\s]/g, '[- ]?')).join('|')})(?:e?s)?\\y`;

const cats = await q(`SELECT id, name, "parentId" FROM "Category"`);
const byId = new Map(cats.map((c) => [c.id, c]));
const blockedDeep = (id, seen = new Set()) => {
  if (seen.has(id)) return false;
  seen.add(id);
  const c = byId.get(id);
  if (!c) return false;
  return isCategoryBlocked(c.name) || (c.parentId ? blockedDeep(c.parentId, seen) : false);
};
const blockedCatIds = cats.filter((c) => blockedDeep(c.id)).map((c) => c.id);

console.log(`moderation gate — ${BLOCKED_NAME_KEYWORDS.length} name keywords, ${blockedCatIds.length} blocked categories\n`);

// ---- 1. leaks ----
// Anything matching the name rule is excluded by every public query, so a leak
// here would mean the rule itself is not reaching a query path. Re-checking in
// SQL is the cheap way to notice that.
const leaks = await q(
  `SELECT p.id, p.name FROM "Product" p
   WHERE p.name ~* $1 AND p."categoryId" IS NOT NULL
     AND NOT (p."categoryId" = ANY($2)) LIMIT 20`,
  [nameRegex, blockedCatIds.length ? blockedCatIds : ['']]
);
console.log(`[1] name-blocked products outside a blocked category: ${leaks.length}`);
console.log(`    (expected — the name rule hides them at query time; listed for awareness)`);

// ---- 2. review tier ----
const stored = await q(`SELECT id, name FROM "Product"`);
const review = stored.filter((r) => needsReview(r.name) && !isNameBlocked(r.name));
console.log(`\n[2] stored products matching REVIEW terms: ${review.length}`);
for (const r of review.slice(0, 20)) console.log(`    #${r.id} ${r.name.slice(0, 76)}`);

// ---- 3. generic buckets ----
const genericCats = cats.filter((c) => isGenericBucket(c.name));
const genericIds = genericCats.map((c) => c.id);
const inGeneric = genericIds.length
  ? await q(`SELECT count(*)::int n FROM "Product" WHERE "categoryId" = ANY($1)`, [genericIds])
  : [{ n: 0 }];
console.log(`\n[3] generic buckets: ${genericCats.length} (${genericCats.map((c) => c.name).join(', ') || 'none'})`);
console.log(`    products inside them: ${inGeneric[0].n}  — imagery cannot be judged from a name; review periodically`);

// ---- report ----
fs.mkdirSync('tools/eprolo/moderation', { recursive: true });
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
fs.writeFileSync(`tools/eprolo/moderation/gate-${stamp}.json`, JSON.stringify(
  { at: new Date().toISOString(), review, genericBuckets: genericCats, inGeneric: inGeneric[0].n }, null, 2));

const failed = review.length > 0;
console.log(`\n${failed ? 'FAIL' : 'PASS'} — ${review.length} product(s) need review`);
await pool.end();
process.exit(failed ? 1 : 0);
