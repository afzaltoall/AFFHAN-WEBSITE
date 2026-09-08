import 'dotenv/config';
import pg from 'pg';
import { revalidateCatalogue } from './revalidate.mjs';

// Proves the tag-based invalidation actually works, by doing the thing that
// used to need a hand-edited cache key and a redeploy: change a category in the
// database and watch the API reflect it.
//
// Renames a real category to a marker, checks the API, renames it back, checks
// again. Both checks happen seconds after the write, well inside the hour the
// old `revalidate: 3600` would have made us wait.

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

const TARGET = 'EPROLO-L1-148'; // "Fully Printing  Hat" — small, kept, harmless
const MARKER = `__REVALIDATION_PROBE_${Date.now()}__`;

const original = (await q(`SELECT id, name FROM "Category" WHERE id=$1`, [TARGET]))[0];
if (!original) { console.log(`target category ${TARGET} not found`); process.exit(1); }
console.log(`probe target: "${original.name}" [${TARGET}]\n`);

const apiShows = async (needle) => {
  const res = await fetch(`${BASE}/api/categories/`, { signal: AbortSignal.timeout(90000) });
  const text = await res.text();
  return text.includes(needle);
};

// Baseline: the API currently serves the real name.
console.log(`baseline — API shows "${original.name}": ${await apiShows(original.name)}`);

// 1. Change the DB, do NOT revalidate. Should still show the stale name.
await pool.query(`UPDATE "Category" SET name=$1 WHERE id=$2`, [MARKER, TARGET]);
const t0 = Date.now();
const staleStillThere = await apiShows(original.name);
const markerBefore = await apiShows(MARKER);
console.log(`\nafter DB write, BEFORE revalidate:`);
console.log(`  API still shows old name : ${staleStillThere}   <- the stale-cache problem`);
console.log(`  API shows new name       : ${markerBefore}`);

// 2. Revalidate, then re-check.
await revalidateCatalogue('categories');
const markerAfter = await apiShows(MARKER);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nafter revalidate (${elapsed}s after the write):`);
console.log(`  API shows new name       : ${markerAfter}   <- ${markerAfter ? 'INVALIDATION WORKS' : 'FAILED'}`);

// 3. Put it back, revalidate again, confirm restored.
await pool.query(`UPDATE "Category" SET name=$1 WHERE id=$2`, [original.name, TARGET]);
await revalidateCatalogue('categories');
const restored = await apiShows(original.name);
const markerGone = !(await apiShows(MARKER));
console.log(`\nrestored:`);
console.log(`  API shows original name  : ${restored}`);
console.log(`  probe marker gone        : ${markerGone}`);

const dbNow = (await q(`SELECT name FROM "Category" WHERE id=$1`, [TARGET]))[0];
console.log(`  DB name back to original : ${dbNow.name === original.name}`);

const pass = !markerBefore && markerAfter && restored && markerGone && dbNow.name === original.name;
console.log(`\n${pass ? 'PASS' : 'FAIL'} — cache invalidation is tag-driven; no key bump, no redeploy`);
await pool.end();
process.exit(pass ? 0 : 1);
