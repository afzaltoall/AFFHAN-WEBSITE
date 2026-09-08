import 'dotenv/config';
import crypto from 'crypto';

// EPROLO OpenAPI client.
//
// The signing scheme is not documented publicly (EPROLO hands the PDF out via
// account support). It was derived against the live gateway, which reports
// each missing/wrong piece in turn, and is:
//
//   apiKey    -> HTTP header, exact casing "apiKey"
//   timestamp -> query string, epoch milliseconds
//   sign      -> query string, MD5(apiKey + timestamp + apiSecret), hex
//
// The gateway accepts the hex digest in either case and accepts a seconds
// timestamp too; we send lowercase hex and milliseconds.
//
// Every response is the same envelope: { code, msg, data }, with code "0"
// meaning success. Note code is a *string*, and HTTP status is 200 even for
// auth failures — never branch on r.ok alone.

const BASE = 'https://openapi.eprolo.com';
const API_KEY = process.env.EPROLO_API_KEY;
const API_SECRET = process.env.EPROLO_API_SECRET;

if (!API_KEY || !API_SECRET) {
  throw new Error('EPROLO_API_KEY / EPROLO_API_SECRET missing from .env');
}

export function sign(timestamp) {
  return crypto
    .createHash('md5')
    .update(`${API_KEY}${timestamp}${API_SECRET}`, 'utf8')
    .digest('hex');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// EPROLO publishes no QPS figure. We pace at ~2 req/s and back off on any
// non-zero code that looks like throttling, which is the same posture the CJ
// client takes.
//
// Calls are serialised end to end, not merely spaced apart. add_product.html
// does real work server-side — measured at ~0.093s per variant, so 3s to 32s
// for one batch — and a second call arriving while one is still in flight is
// rejected with an empty 200 body rather than a queue or a 429. Spacing call
// *starts* by 500ms is not enough when a call runs for 30s, so each request
// holds the lane until it completes.
let lastCallAt = 0;
const MIN_GAP_MS = 500;

// Only writes need the single lane. add_product.html is the endpoint that
// rejects an overlapping call; the read endpoints (product lists, getproduct,
// the category trees) were never observed to fail under concurrency, and
// forcing all 20 per-product reads on a page to queue behind one another was
// measured at 1.8 min/page — about 19h for the catalogue, against ~5h when the
// reads are allowed to overlap.
//
// So: writes are strictly serial against other writes, reads run a few at a
// time, and both share the same minimum spacing.
const WRITE_ENDPOINTS = /add_product|import_smt/i;
const READ_CONCURRENCY = Number(process.env.EPROLO_READ_CONCURRENCY ?? 5);

let writeLane = Promise.resolve();
function serialiseWrite(fn) {
  const run = writeLane.then(fn, fn);
  writeLane = run.then(() => {}, () => {});
  return run;
}

let activeReads = 0;
const readWaiters = [];
async function acquireRead() {
  if (activeReads < READ_CONCURRENCY) { activeReads++; return; }
  await new Promise((r) => readWaiters.push(r));
  activeReads++;
}
function releaseRead() {
  activeReads--;
  const next = readWaiters.shift();
  if (next) next();
}

export async function eproloCall(endpoint, params = {}, opts = {}) {
  if (WRITE_ENDPOINTS.test(endpoint)) {
    return serialiseWrite(() => eproloCallUnsafe(endpoint, params, opts));
  }
  await acquireRead();
  try {
    return await eproloCallUnsafe(endpoint, params, opts);
  } finally {
    releaseRead();
  }
}

async function eproloCallUnsafe(endpoint, params = {}, { method = 'GET', body, retries = 3 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const gap = Date.now() - lastCallAt;
    if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
    lastCallAt = Date.now();

    const ts = String(Date.now());
    const qs = new URLSearchParams({ ...params, timestamp: ts, sign: sign(ts) });
    const url = `${BASE}/${endpoint}?${qs}`;

    const headers = { apiKey: API_KEY };
    let payload;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let res, text;
    try {
      res = await fetch(url, { method, headers, body: payload, signal: AbortSignal.timeout(60000) });
      text = await res.text();
    } catch (e) {
      if (attempt === retries) throw new Error(`${endpoint}: network error: ${e.message}`);
      await sleep(2000 * (attempt + 1));
      continue;
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${endpoint}: non-JSON response (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    if (String(json.code) === '0') return json.data;

    const msg = json.msg || '';
    if (/frequen|too many|limit/i.test(msg) && attempt < retries) {
      await sleep(3000 * (attempt + 1));
      continue;
    }
    throw new Error(`${endpoint}: code=${json.code} msg=${msg}`);
  }
}

// Returns the raw envelope rather than just .data — used by the auth smoke test
// so the actual wire response can be shown.
export async function eproloRaw(endpoint, params = {}) {
  const ts = String(Date.now());
  const qs = new URLSearchParams({ ...params, timestamp: ts, sign: sign(ts) });
  const res = await fetch(`${BASE}/${endpoint}?${qs}`, {
    headers: { apiKey: API_KEY },
    signal: AbortSignal.timeout(60000),
  });
  return { status: res.status, text: await res.text() };
}

export { BASE };
