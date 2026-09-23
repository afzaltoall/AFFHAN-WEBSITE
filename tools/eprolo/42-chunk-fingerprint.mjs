import fs from 'node:fs';

// What library is inside each JS chunk the homepage loads?
//
//   node tools/eprolo/42-chunk-fingerprint.mjs [url]
//
// Chunk filenames are content-hashed and say nothing. This downloads the ones
// the page actually requests and looks for strings each library leaves behind,
// so "415 KB of JavaScript" becomes a list naming what to act on.

const URL_ARG = process.argv[2] ?? 'https://affhan.com/';
const origin = new URL(URL_ARG).origin;

// Markers chosen to survive minification: error text, and property names that
// are part of a public API and therefore not renamed.
const MARKERS = [
  ['react-dom', /createRoot|hydrateRoot|Minified React error/],
  ['framer-motion', /framer|useMotionValue|animateMotionValue|projectionNodeConstructor/],
  ['gsap', /gsap|TweenMax|ScrollTrigger|_gsDefine/],
  ['three', /THREE\.|WebGLRenderer|BufferGeometry/],
  ['recharts', /recharts|CartesianGrid|ResponsiveContainer/],
  ['lucide', /lucide|stroke-linejoin/],
  ['react-zoom-pan-pinch', /TransformWrapper|zoom-pan-pinch/],
  ['next/image', /__next_img|deviceSizes|unoptimized/],
  ['next router', /app-router|useSearchParams|RedirectBoundary/],
];

const html = await (await fetch(URL_ARG, { headers: { 'Accept-Encoding': 'identity' } })).text();
const srcs = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]))];
console.log(`${srcs.length} script tags on ${URL_ARG}\n`);

const rows = [];
for (const src of srcs) {
  const url = src.startsWith('http') ? src : origin + src;
  try {
    const res = await fetch(url);
    const body = await res.text();
    const enc = Number(res.headers.get('content-length')) || Buffer.byteLength(body);
    const hits = MARKERS.filter(([, re]) => re.test(body)).map(([name]) => name);
    rows.push({ url: src, raw: body.length, enc, hits });
  } catch (e) {
    rows.push({ url: src, raw: 0, enc: 0, hits: ['(fetch failed)'] });
  }
}

rows.sort((a, b) => b.raw - a.raw);
const kb = (b) => (b / 1024).toFixed(0).padStart(6) + ' KB';
let totalRaw = 0, totalEnc = 0;
for (const r of rows) {
  totalRaw += r.raw; totalEnc += r.enc;
  console.log(`${kb(r.raw)} raw ${kb(r.enc)} sent  ${r.url.split('/').pop().slice(0, 34).padEnd(34)}  ${r.hits.join(', ') || '(app code)'}`);
}
console.log(`\ntotal: ${kb(totalRaw)} unminified-in-flight, ${kb(totalEnc)} over the wire`);

// Which libraries account for the most bytes, counting a chunk once per library.
const byLib = new Map();
for (const r of rows) for (const h of r.hits) byLib.set(h, (byLib.get(h) ?? 0) + r.raw);
console.log(`\nchunks containing each library (raw bytes of the whole chunk):`);
for (const [lib, b] of [...byLib.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${kb(b)}  ${lib}`);
