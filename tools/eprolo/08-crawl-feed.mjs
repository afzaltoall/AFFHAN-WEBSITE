import 'dotenv/config';
import fs from 'fs';
import { eproloCall } from './client.mjs';

// Crawls eprolo_product_list.html across every page into a local JSONL cache.
//
// The feed already carries everything we store — variantlist, imagelist, cost,
// weight, body_html — so this is the single source for the whole ingest. No
// add_product, no getproduct: those cost an account import slot (capped at 500)
// and, apart from a fresher inventory_quantity, returned identical data.
//
// Caching to disk rather than streaming straight into the ingest keeps the two
// concerns separable: the crawl is ~6 minutes of API time, and re-running the
// image/DB work afterwards must not mean paying for it again.

const FIRST_PAGE = Number(process.env.FIRST_PAGE ?? 1);
const LAST_PAGE = Number(process.env.LAST_PAGE ?? 649);
const OUT = 'tools/eprolo/feed-cache.jsonl';

const out = fs.createWriteStream(OUT, { flags: 'w' });
const t0 = Date.now();

let pages = 0, products = 0, variants = 0, images = 0;
const seen = new Set();
let duplicates = 0;

for (let n = FIRST_PAGE; n <= LAST_PAGE; n++) {
  let feed;
  try {
    feed = await eproloCall('eprolo_product_list.html', { page: String(n) });
  } catch (e) {
    // Past the last page EPROLO answers code=-1 "No data". That is the feed
    // ending, not a failure.
    if (/No data/i.test(e.message)) {
      console.log(`page ${n}: end of feed — stopping cleanly`);
      break;
    }
    console.log(`page ${n}: ERROR ${e.message}`);
    continue;
  }
  if (!feed.length) {
    console.log(`page ${n}: empty — stopping`);
    break;
  }

  for (const p of feed) {
    const id = String(p.id);
    if (seen.has(id)) { duplicates++; continue; }
    seen.add(id);
    products++;
    variants += p.variantlist?.length ?? 0;
    images += new Set([p.imagefirst, ...(p.imagelist || []).map((i) => i.src)].filter(Boolean)).size;
    out.write(JSON.stringify({ page: n, product: p }) + '\n');
  }
  pages++;

  if (pages % 50 === 0) {
    const mins = (Date.now() - t0) / 60000;
    console.log(
      `[${new Date().toISOString().slice(11, 19)}] page ${n} | ` +
      `${products} products | ${variants} variants | ${images} images | ` +
      `${(pages / mins).toFixed(1)} pages/min`
    );
  }
}

await new Promise((r) => out.end(r));

console.log(`\n===== CRAWL COMPLETE in ${((Date.now() - t0) / 60000).toFixed(1)} min =====`);
console.log(`pages crawled     : ${pages}`);
console.log(`distinct products : ${products}`);
console.log(`duplicate ids skipped: ${duplicates}`);
console.log(`variants          : ${variants}`);
console.log(`distinct images   : ${images}`);
console.log(`cache             : ${OUT} (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB)`);
