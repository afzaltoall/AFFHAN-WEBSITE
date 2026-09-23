// Does production serve what origin/main builds?
//
//   node tools/audit/121-local-vs-prod.mjs [localBase]
//
// Read-only. Fetches the same six routes from a local build of origin/main and
// from production, and diffs the head tags field by field. A difference means
// production is not serving main — which is exactly what the hand-promoted
// branch builds caused earlier today.

const LOCAL = process.argv[2] ?? 'http://localhost:3120';
const PROD = 'https://affhan.com';
const ROUTES = ['/', '/sourcing-company-dubai/', '/sourcing-company-chennai/',
                '/sourcing-company-uk/', '/about/', '/contact/'];

const pick = (h, re) => (h.match(re)?.[1] ?? '').trim();
const types = (h) => {
  const t = new Set();
  for (const m of h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1]);
      for (const n of (Array.isArray(j) ? j : j['@graph'] ?? [j])) t.add(n['@type']);
    } catch { t.add('(invalid)'); }
  }
  return [...t].flat().sort().join(',');
};
const shape = (h) => ({
  title: pick(h, /<title>([^<]*)<\/title>/),
  desc: pick(h, /<meta name="description" content="([^"]*)"/),
  canonical: pick(h, /<link rel="canonical" href="([^"]*)"/),
  ogImage: pick(h, /<meta property="og:image"[^>]*content="([^"]*)"/),
  ldTypes: types(h),
  nosnippet: (h.match(/data-nosnippet/g) || []).length,
  nosnippetSpan: /<span data-nosnippet/.test(h),
});

let diffs = 0;
console.log(`\nlocal build of origin/main  vs  production\n`);
for (const r of ROUTES) {
  const [a, b] = await Promise.all([
    fetch(LOCAL + r).then((x) => x.text()),
    fetch(PROD + r).then((x) => x.text()),
  ]);
  const L = shape(a), P = shape(b);
  const fields = Object.keys(L);
  const bad = fields.filter((f) => String(L[f]) !== String(P[f]));
  console.log(`  ${r.padEnd(30)} ${bad.length === 0 ? 'IDENTICAL' : 'DIFFERS on ' + bad.join(', ')}`);
  for (const f of bad) {
    console.log(`     ${f}\n        local: ${L[f]}\n        prod : ${P[f]}`);
  }
  if (bad.length === 0) {
    console.log(`     title ${L.title}`);
    console.log(`     ld    ${L.ldTypes}   og:image ${L.ogImage ? 'yes' : 'NO'}   data-nosnippet x${L.nosnippet} (span=${L.nosnippetSpan})`);
  }
  diffs += bad.length;
}
console.log(`\n${diffs === 0 ? 'Production matches the local build of origin/main on every field.' : diffs + ' field difference(s) — production is NOT serving main.'}`);
