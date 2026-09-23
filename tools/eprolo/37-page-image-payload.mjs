// Total image bytes a page actually asks the browser to download.
//
//   node tools/eprolo/37-page-image-payload.mjs <url> [url...]
//
// Splits the total by host, because that is the whole point here: images on the
// Serverless Image Handler domain have been resized, and anything still on the
// raw S3/CloudFront domain is a full-resolution supplier original that slipped
// through a getCdnUrl() call with no width argument.

const HANDLER = 'daje3fmp2npne.cloudfront.net';
const RAW = 'd294cbym1d7nev.cloudfront.net';
const kb = (b) => (b / 1024).toFixed(0) + ' KB';

for (const page of process.argv.slice(2)) {
  const res = await fetch(page, { headers: { 'Accept-Encoding': 'identity' }, redirect: 'follow' });
  const html = await res.text();

  const srcs = [...new Set(
    [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1])
      .filter((u) => /^https?:\/\//.test(u))
  )];

  const buckets = { handler: { n: 0, bytes: 0 }, raw: { n: 0, bytes: 0 }, other: { n: 0, bytes: 0 } };
  const rawFiles = [];

  await Promise.all(srcs.map(async (u) => {
    const which = u.includes(HANDLER) ? 'handler' : u.includes(RAW) ? 'raw' : 'other';
    try {
      // The handler only reports a length once it has produced the derivative,
      // so GET rather than HEAD — it is also what the browser does.
      const r = await fetch(u, { signal: AbortSignal.timeout(45000) });
      if (!r.ok) return;
      const len = (await r.arrayBuffer()).byteLength;
      buckets[which].n++; buckets[which].bytes += len;
      if (which === 'raw') rawFiles.push([len, u.split('/').pop()]);
    } catch {}
  }));

  const total = buckets.handler.bytes + buckets.raw.bytes + buckets.other.bytes;
  console.log(`\n=== ${page}`);
  console.log(`  resized (image handler) : ${String(buckets.handler.n).padStart(3)} images  ${kb(buckets.handler.bytes).padStart(9)}`);
  console.log(`  RAW originals           : ${String(buckets.raw.n).padStart(3)} images  ${kb(buckets.raw.bytes).padStart(9)}`);
  console.log(`  other (local/static)    : ${String(buckets.other.n).padStart(3)} images  ${kb(buckets.other.bytes).padStart(9)}`);
  console.log(`  TOTAL                   : ${String(buckets.handler.n + buckets.raw.n + buckets.other.n).padStart(3)} images  ${kb(total).padStart(9)}`);
  if (rawFiles.length) {
    rawFiles.sort((a, b) => b[0] - a[0]);
    console.log('  raw originals still present:');
    for (const [l, f] of rawFiles.slice(0, 10)) console.log(`    ${kb(l).padStart(9)}  ${f}`);
  }
}
