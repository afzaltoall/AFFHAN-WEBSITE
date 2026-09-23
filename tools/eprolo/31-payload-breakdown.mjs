import fs from 'node:fs';

// What the homepage HTML is actually made of.
//
//   node tools/eprolo/31-payload-breakdown.mjs <saved-html-file>
//
// Before trimming anything for LCP it is worth knowing whether the thing being
// trimmed is a meaningful share of the bytes. Splits the document into the RSC
// flight payload (self.__next_f) and everything else, then counts how many of
// the flight's bytes belong to categories versus products.

const file = process.argv[2] ?? './tmp-home.html';
const h = fs.readFileSync(file, 'utf8');
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

console.log(`file                 : ${file}`);
console.log(`total HTML           : ${kb(h.length)}`);

const chunks = [...h.matchAll(/self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)/g)].map((m) => m[1]);
const flight = chunks.join('');
console.log(`RSC flight payload   : ${kb(flight.length)} in ${chunks.length} chunks (${((flight.length / h.length) * 100).toFixed(0)}% of the document)`);

// Category objects carry thumbnailUrl; product objects carry imageUrl. Counting
// occurrences and multiplying by a measured average object size is rough, so
// instead slice out the two arrays where they can be located.
const count = (re) => (flight.match(re) || []).length;
console.log(`  thumbnailUrl keys  : ${count(/thumbnailUrl/g)}`);
console.log(`  imageUrl keys      : ${count(/imageUrl/g)}`);
console.log(`  productCount keys  : ${count(/productCount/g)}`);

// Size of the category data specifically: every {...thumbnailUrl...} object.
const catObjects = flight.match(/\{[^{}]*thumbnailUrl[^{}]*\}/g) || [];
const catBytes = catObjects.reduce((s, o) => s + o.length, 0);
console.log(`  category objects   : ${catObjects.length} totalling ${kb(catBytes)} (${((catBytes / h.length) * 100).toFixed(0)}% of the document)`);

const prodObjects = flight.match(/\{[^{}]*imageUrl[^{}]*\}/g) || [];
const prodBytes = prodObjects.reduce((s, o) => s + o.length, 0);
console.log(`  product objects    : ${prodObjects.length} totalling ${kb(prodBytes)} (${((prodBytes / h.length) * 100).toFixed(0)}% of the document)`);

// Scripts the browser has to fetch before it can hydrate.
const scripts = [...h.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
console.log(`\nscript tags          : ${scripts.length}`);
for (const s of scripts) console.log(`  ${s}`);

const preloads = [...h.matchAll(/<link[^>]+rel="preload"[^>]*>/g)];
console.log(`\npreload links        : ${preloads.length}`);
for (const p of preloads) console.log(`  ${p[0].slice(0, 160)}`);
