import 'dotenv/config';
import http from 'node:http';
import pg from 'pg';
import { revalidateCatalogue } from './revalidate.mjs';

// Verifies the CDN-facing staleness window, not just the origin's.
//
// 19-verify-revalidation.mjs proves revalidateTag fixes the ORIGIN in seconds.
// It cannot prove anything about the edge, because the edge is what serves a
// cached copy regardless of what the origin now thinks. There is no CDN in
// front of localhost and no deployed URL configured here, so this stands one in
// front: a proxy that obeys Cache-Control exactly as a shared cache does —
// serve from store while age < s-maxage, revalidate past it, and honour
// must-revalidate by refusing to serve stale at all.
//
// The test then does what an emergency block would do: change the database,
// revalidate, and measure how long the CDN-facing URL keeps serving the old
// answer. It also replays the same timeline against the header this route used
// to send, so the improvement is measured rather than asserted.

const ORIGIN = 'http://localhost:3000';
const PROXY_PORT = Number(process.env.PROXY_PORT ?? 4599);
const TARGET_PATH = '/api/categories/';
const TARGET_CAT = 'EPROLO-L1-148';
const MARKER = `__CDN_PROBE_${Date.now()}__`;
const OLD_HEADER = 'public, s-maxage=3600, stale-while-revalidate=86400';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

const parseSMaxAge = (cc) => {
  const m = /s-maxage=(\d+)/.exec(cc ?? '');
  return m ? Number(m[1]) : null;
};
const parseSWR = (cc) => {
  const m = /stale-while-revalidate=(\d+)/.exec(cc ?? '');
  return m ? Number(m[1]) : 0;
};

// ---- the stand-in CDN ----
const store = new Map();
let originHits = 0;

const server = http.createServer(async (req, res) => {
  const key = req.url;
  const now = Date.now();
  const hit = store.get(key);

  if (hit) {
    const age = (now - hit.storedAt) / 1000;
    if (age < hit.sMaxAge) {
      res.writeHead(200, { 'content-type': 'application/json', 'x-cache': 'HIT', 'x-age': age.toFixed(1) });
      return res.end(hit.body);
    }
    // Past s-maxage. A shared cache may serve stale for stale-while-revalidate
    // seconds beyond that — unless must-revalidate forbids it, which is the
    // whole point of the new header.
    if (!hit.mustRevalidate && age < hit.sMaxAge + hit.swr) {
      res.writeHead(200, { 'content-type': 'application/json', 'x-cache': 'STALE', 'x-age': age.toFixed(1) });
      res.end(hit.body);
      // background refresh, as a CDN would
      fetch(ORIGIN + key).then(async (r) => {
        const cc = r.headers.get('cache-control');
        originHits++;
        store.set(key, {
          body: await r.text(), storedAt: Date.now(),
          sMaxAge: parseSMaxAge(cc) ?? 0, swr: parseSWR(cc),
          mustRevalidate: /must-revalidate/.test(cc ?? ''),
        });
      }).catch(() => {});
      return;
    }
  }

  const r = await fetch(ORIGIN + key, { signal: AbortSignal.timeout(120000) });
  const body = await r.text();
  const cc = r.headers.get('cache-control');
  originHits++;
  store.set(key, {
    body, storedAt: Date.now(),
    sMaxAge: parseSMaxAge(cc) ?? 0, swr: parseSWR(cc),
    mustRevalidate: /must-revalidate/.test(cc ?? ''),
  });
  res.writeHead(200, { 'content-type': 'application/json', 'x-cache': 'MISS', 'x-cc': cc ?? '' });
  res.end(body);
});
await new Promise((r) => server.listen(PROXY_PORT, r));
const CDN = `http://localhost:${PROXY_PORT}`;
console.log(`stand-in CDN on ${CDN} -> ${ORIGIN}\n`);

// ---- what does the origin actually send now? ----
const head = await fetch(ORIGIN + TARGET_PATH);
const cc = head.headers.get('cache-control');
const sMaxAge = parseSMaxAge(cc);
const swr = parseSWR(cc);
const mustRevalidate = /must-revalidate/.test(cc ?? '');
console.log(`origin Cache-Control : ${cc}`);
console.log(`  s-maxage           : ${sMaxAge}s`);
console.log(`  stale-while-revalidate: ${swr}s`);
console.log(`  must-revalidate    : ${mustRevalidate}`);
console.log(`  worst-case CDN staleness: ${mustRevalidate ? sMaxAge : sMaxAge + swr}s`);
const oldWorst = parseSMaxAge(OLD_HEADER) + parseSWR(OLD_HEADER);
console.log(`  previously          : ${oldWorst}s (${(oldWorst / 3600).toFixed(1)}h)\n`);

const original = (await q(`SELECT name FROM "Category" WHERE id=$1`, [TARGET_CAT]))[0];
if (!original) { console.log('probe category missing'); process.exit(1); }

const cdnShows = async (needle) => {
  const r = await fetch(`${CDN}${TARGET_PATH}`, { signal: AbortSignal.timeout(120000) });
  const t = await r.text();
  return { has: t.includes(needle), cache: r.headers.get('x-cache'), age: r.headers.get('x-age') };
};

let pass = false;
try {
  // Prime the edge with the current answer.
  const primed = await cdnShows(original.name);
  console.log(`primed CDN: shows "${original.name}" = ${primed.has} (${primed.cache})`);

  // The emergency: change the DB and revalidate, exactly as a block would.
  await pool.query(`UPDATE "Category" SET name=$1 WHERE id=$2`, [MARKER, TARGET_CAT]);
  await revalidateCatalogue('categories');
  const t0 = Date.now();

  const origin = await (await fetch(ORIGIN + TARGET_PATH)).text();
  console.log(`origin reflects the change immediately: ${origin.includes(MARKER)}`);

  const immediately = await cdnShows(MARKER);
  console.log(`CDN immediately after: shows change = ${immediately.has} (${immediately.cache}, age ${immediately.age}s) — cached, as expected`);

  // Poll the CDN until it catches up, and time it.
  console.log(`\npolling the CDN-facing URL until it reflects the change…`);
  let elapsed = null;
  while ((Date.now() - t0) / 1000 < (sMaxAge + swr + 30)) {
    const r = await cdnShows(MARKER);
    if (r.has) { elapsed = (Date.now() - t0) / 1000; console.log(`  caught up after ${elapsed.toFixed(1)}s (${r.cache})`); break; }
    await new Promise((s) => setTimeout(s, 5000));
    process.stdout.write('.');
  }

  const bound = mustRevalidate ? sMaxAge : sMaxAge + swr;
  if (elapsed === null) {
    console.log(`\nFAIL — CDN never caught up within ${bound + 30}s`);
  } else {
    console.log(`\nCDN staleness window: ${elapsed.toFixed(1)}s (bound ${bound}s)`);
    console.log(`under the old header the same change would still be stale for up to ${(oldWorst / 3600).toFixed(1)}h`);
    pass = elapsed <= bound + 15;
  }
} finally {
  await pool.query(`UPDATE "Category" SET name=$1 WHERE id=$2`, [original.name, TARGET_CAT]);
  await revalidateCatalogue('categories');
  const restored = (await q(`SELECT name FROM "Category" WHERE id=$1`, [TARGET_CAT]))[0];
  console.log(`\nrestored DB name: ${restored.name === original.name}`);
  console.log(`origin requests the stand-in CDN made: ${originHits}`);
  server.close();
  await pool.end();
}

console.log(pass ? '\nPASS — CDN reflects a moderation change inside the shortened window' : '\nFAIL');
process.exit(pass ? 0 : 1);
