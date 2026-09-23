// Route-by-route SEO audit against production.
//
//   node tools/audit/110-seo-audit.mjs
//
// READ-ONLY: fetches, parses, writes one JSON report. Changes no site file.
// Covers audit items 2 (per-route table), 3 (snippets), 4 (structured data),
// 6 (near-duplicate text) and 7 (internal links vs sitemap).

import fs from 'node:fs';

const ORIGIN = 'https://affhan.com';
const ROUTES = [
  '/', '/about/', '/contact/', '/shipping/', '/careers/', '/products/',
  '/categories/', '/rankings/', '/privacy-policy/', '/terms-conditions/',
  '/china-sourcing-company/', '/china-sourcing-office-guangzhou/', '/sourcing-from-china/',
  '/sourcing-company-chennai/', '/sourcing-company-dubai/', '/sourcing-company-uk/',
  '/sourcing-company-singapore/', '/sourcing-company-malaysia/', '/sourcing-company-france/',
  // dynamic samples
  '/careers/sourcing-specialist/',
];

const pick = (h, re) => (h.match(re)?.[1] ?? '').trim();
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

/** Visible words: scripts, styles and tags removed. */
function textOf(html) {
  return decode(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const parsed = JSON.parse(m[1]);
      for (const node of (Array.isArray(parsed) ? parsed : parsed['@graph'] ?? [parsed])) out.push(node);
    } catch { out.push({ '@type': '(unparseable)' }); }
  }
  return out;
}

async function audit(route) {
  const url = ORIGIN + route;
  const res = await fetch(url, { redirect: 'manual' });
  const chain = [`${res.status}`];
  let html = '';
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    chain.push(`-> ${loc}`);
    html = await (await fetch(new URL(loc, url))).text();
  } else {
    html = await res.text();
  }

  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)]
    .map((m) => decode(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim());
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)];
  const noAlt = imgs.filter((m) => !/\balt=/.test(m[0])).length;
  const emptyAlt = imgs.filter((m) => /\balt=""/.test(m[0])).length;
  const links = [...new Set([...html.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]))];
  const text = textOf(html);

  return {
    route,
    status: res.status,
    chain: chain.join(' '),
    title: decode(pick(html, /<title>([^<]*)<\/title>/)),
    desc: decode(pick(html, /<meta name="description" content="([^"]*)"/)),
    canonical: pick(html, /<link rel="canonical" href="([^"]*)"/),
    robots: pick(html, /<meta name="robots" content="([^"]*)"/) || '(none)',
    ogTitle: decode(pick(html, /<meta property="og:title" content="([^"]*)"/)),
    ogDesc: decode(pick(html, /<meta property="og:description" content="([^"]*)"/)),
    ogImage: pick(html, /<meta property="og:image"[^>]*content="([^"]*)"/),
    ogSite: decode(pick(html, /<meta property="og:site_name" content="([^"]*)"/)),
    twCard: pick(html, /<meta name="twitter:card" content="([^"]*)"/),
    twTitle: decode(pick(html, /<meta name="twitter:title" content="([^"]*)"/)),
    h1Count: h1s.length,
    h1: h1s[0] ?? '',
    words: text.split(' ').filter(Boolean).length,
    imgs: imgs.length,
    noAlt,
    emptyAlt,
    outLinks: links.length,
    links,
    ld: jsonLd(html),
    firstPara: (() => {
      // First substantive <p> in the body.
      for (const m of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
        const t = decode(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
        if (t.length > 80) return t;
      }
      return '';
    })(),
    text,
  };
}

const pages = [];
for (const r of ROUTES) {
  try { pages.push(await audit(r)); process.stderr.write('.'); }
  catch (e) { pages.push({ route: r, error: String(e).slice(0, 90) }); process.stderr.write('x'); }
}
process.stderr.write('\n');

// ---- sitemap + inbound links
const sm = await (await fetch(ORIGIN + '/sitemap.xml')).text();
const sitemapUrls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(ORIGIN, ''));
const inbound = new Map(ROUTES.map((r) => [r, 0]));
for (const p of pages) for (const l of p.links ?? []) if (inbound.has(l)) inbound.set(l, inbound.get(l) + 1);

// ---- near-duplicate similarity between location pages
const LOC = pages.filter((p) => /sourcing-company-|china-sourcing|sourcing-from-china/.test(p.route) && p.text);
const shingles = (t) => {
  const w = t.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  const s = new Set();
  for (let i = 0; i + 4 < w.length; i++) s.add(w.slice(i, i + 5).join(' '));
  return s;
};
const sets = new Map(LOC.map((p) => [p.route, shingles(p.text)]));
const sim = [];
for (let i = 0; i < LOC.length; i++) {
  for (let j = i + 1; j < LOC.length; j++) {
    const a = sets.get(LOC[i].route), b = sets.get(LOC[j].route);
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    sim.push({ a: LOC[i].route, b: LOC[j].route, jaccard: +(inter / (a.size + b.size - inter)).toFixed(3),
               containment: +(inter / Math.min(a.size, b.size)).toFixed(3) });
  }
}
sim.sort((x, y) => y.containment - x.containment);

const report = { pages, sitemapUrls, inbound: Object.fromEntries(inbound), similarity: sim };
fs.mkdirSync('tools/audit/seo', { recursive: true });
fs.writeFileSync('tools/audit/seo/audit.json', JSON.stringify(report, null, 2));

// ---------------------------------------------------------------- printout
console.log('=== ITEM 2: per-route\n');
console.log(`${'route'.padEnd(38)} ${'st'.padStart(3)} ${'title'.padStart(5)} ${'desc'.padStart(4)} ${'h1'.padStart(2)} ${'words'.padStart(5)} ${'img'.padStart(3)} ${'noalt'.padStart(5)} ${'out'.padStart(4)}  canonical ok  robots`);
for (const p of pages) {
  if (p.error) { console.log(`${p.route.padEnd(38)} ERROR ${p.error}`); continue; }
  const canonOk = p.canonical === ORIGIN + p.route ? 'yes' : `NO(${p.canonical.replace(ORIGIN, '') || 'none'})`;
  console.log(`${p.route.padEnd(38)} ${String(p.status).padStart(3)} ${String(p.title.length).padStart(5)} ${String(p.desc.length).padStart(4)} ${String(p.h1Count).padStart(2)} ${String(p.words).padStart(5)} ${String(p.imgs).padStart(3)} ${String(p.noAlt).padStart(5)} ${String(p.outLinks).padStart(4)}  ${canonOk.padEnd(12)} ${p.robots}`);
}

console.log('\n=== duplicate titles / descriptions\n');
for (const key of ['title', 'desc']) {
  const by = new Map();
  for (const p of pages) if (p[key]) by.set(p[key], [...(by.get(p[key]) ?? []), p.route]);
  for (const [v, rs] of by) if (rs.length > 1) console.log(`  ${key} shared by ${rs.length}: ${rs.join(', ')}\n     "${v.slice(0, 110)}"`);
}

console.log('\n=== OG / Twitter gaps\n');
for (const p of pages) {
  if (p.error) continue;
  const miss = [];
  if (!p.ogTitle) miss.push('og:title');
  if (!p.ogDesc) miss.push('og:description');
  if (!p.ogImage) miss.push('og:image');
  if (!p.ogSite) miss.push('og:site_name');
  if (!p.twCard) miss.push('twitter:card');
  if (!p.twTitle) miss.push('twitter:title');
  if (miss.length) console.log(`  ${p.route.padEnd(38)} missing ${miss.join(', ')}`);
}
console.log('  og:site_name values: ' + [...new Set(pages.map((p) => p.ogSite).filter(Boolean))].join(' | '));

console.log('\n=== ITEM 4: structured data @types per page\n');
for (const p of pages) {
  if (p.error) continue;
  console.log(`  ${p.route.padEnd(38)} ${[...new Set(p.ld.map((n) => n['@type']).flat())].join(', ') || '(none)'}`);
}

console.log('\n=== ITEM 6: location-page similarity (5-word shingles)\n');
for (const s of sim.slice(0, 12)) {
  console.log(`  ${(s.a + ' vs ' + s.b).padEnd(72)} shared ${(s.containment * 100).toFixed(1)}%  jaccard ${(s.jaccard * 100).toFixed(1)}%`);
}

console.log('\n=== ITEM 7: sitemap vs routes\n');
const routeSet = new Set(ROUTES);
console.log('  in sitemap but not an audited route:');
for (const u of sitemapUrls) if (!routeSet.has(u)) console.log(`     ${u}`);
console.log('  audited route missing from sitemap:');
for (const r of ROUTES) if (!sitemapUrls.includes(r)) console.log(`     ${r}`);
console.log('  routes with zero inbound links from the pages crawled:');
for (const [r, n] of inbound) if (n === 0) console.log(`     ${r}`);

console.log('\nfull data: tools/audit/seo/audit.json');
