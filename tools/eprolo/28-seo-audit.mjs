import 'dotenv/config';
import pg from 'pg';

// SEO health audit against PRODUCTION. Read-only.
//
// Everything is fetched from the live site rather than reasoned about from the
// source, because what matters for SEO is what a crawler actually receives —
// after ISR, after the CDN, after any middleware.

const BASE = process.env.SEO_BASE ?? 'https://affhan.com';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

const get = async (path, opts = {}) => {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(90000), ...opts });
  return { status: r.status, url: r.url, text: await r.text(), headers: r.headers };
};
const pick = (html, re) => { const m = re.exec(html); return m ? m[1].trim() : null; };
const title = (h) => pick(h, /<title>([^<]*)<\/title>/i);
const desc = (h) => pick(h, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
  ?? pick(h, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
const canonical = (h) => pick(h, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
const robotsMeta = (h) => pick(h, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i);
const ogTags = (h) => (h.match(/property=["']og:[a-z:]+["']/gi) || []).map((s) => s.replace(/property=["']|["']/g, ''));
const jsonLdTypes = (h) => {
  const out = [];
  const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(h))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const o of arr) {
        if (o['@graph']) for (const g of o['@graph']) out.push(g['@type']);
        else out.push(o['@type']);
      }
    } catch { out.push('(INVALID JSON)'); }
  }
  return out.flat().filter(Boolean);
};

const results = [];
const row = (check, status, detail) => { results.push({ check, status, detail }); console.log(`  [${status}] ${check} — ${detail}`); };

// ---------------------------------------------------------------- 7. robots
console.log('=== robots.txt ===');
{
  const r = await get('/robots.txt');
  const blocksAdmin = /Disallow:\s*\/admin/i.test(r.text);
  const blocksApi = /Disallow:\s*\/api/i.test(r.text);
  const hasSitemap = /Sitemap:\s*http/i.test(r.text);
  row('robots.txt reachable', r.status === 200 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  row('blocks /admin', blocksAdmin ? 'PASS' : 'FAIL', blocksAdmin ? 'Disallow present' : 'NOT blocked');
  row('blocks /api', blocksApi ? 'PASS' : 'FAIL', blocksApi ? 'Disallow present' : 'NOT blocked');
  row('declares sitemap', hasSitemap ? 'PASS' : 'FAIL', pick(r.text, /Sitemap:\s*(\S+)/i) ?? 'missing');
}

// ---------------------------------------------------------------- 2. sitemap
console.log('\n=== sitemap ===');
let sitemapUrls = [];
{
  const r = await get('/sitemap.xml');
  const isIndex = /<sitemapindex/i.test(r.text);
  const locs = [...r.text.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1]);
  row('sitemap.xml reachable', r.status === 200 ? 'PASS' : 'FAIL', `HTTP ${r.status}, ${isIndex ? 'index' : 'urlset'}, ${locs.length} <loc>`);
  if (isIndex) {
    for (const child of locs.slice(0, 12)) {
      const c = await get(child);
      const childLocs = [...c.text.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1]);
      sitemapUrls.push(...childLocs);
      console.log(`     ${child.replace(BASE, '')} -> ${childLocs.length} urls`);
    }
  } else sitemapUrls = locs;
  row('total sitemap URLs', sitemapUrls.length > 0 ? 'PASS' : 'FAIL', String(sitemapUrls.length));

  const productUrls = sitemapUrls.filter((u) => /\/products\/\d/.test(u)).length;
  const categoryUrls = sitemapUrls.filter((u) => /categoryId=|\/category\//.test(u)).length;
  const dbProducts = (await q(`SELECT count(*)::int n FROM "Product"`))[0].n;
  const dbEprolo = (await q(`SELECT count(*)::int n FROM "Product" WHERE "supplierSource"='EPROLO'`))[0].n;
  const dbCats = (await q(`SELECT count(*)::int n FROM "Category"`))[0].n;
  row('product URLs in sitemap', productUrls > 0 ? 'INFO' : 'FAIL', `${productUrls} vs ${dbProducts} products in DB (${dbEprolo} EPROLO)`);
  row('category URLs in sitemap', categoryUrls > 0 ? 'INFO' : 'FAIL', `${categoryUrls} vs ${dbCats} categories in DB`);

  // Are EPROLO products actually present?
  const eproloSample = await q(`SELECT id FROM "Product" WHERE "supplierSource"='EPROLO' ORDER BY id DESC LIMIT 5`);
  const found = eproloSample.filter((p) => sitemapUrls.some((u) => u.endsWith(`/products/${p.id}`) || u.endsWith(`/products/${p.id}/`)));
  row('EPROLO products in sitemap', found.length ? 'PASS' : 'FAIL', `${found.length}/5 sampled EPROLO ids present`);
}

// ---------------------------------------------------------------- 3+4. metadata & schema
console.log('\n=== metadata + structured data by page type ===');
const eproloIds = (await q(`SELECT id FROM "Product" WHERE "supplierSource"='EPROLO' ORDER BY id DESC LIMIT 2`)).map((r) => r.id);
const cjIds = (await q(`SELECT id FROM "Product" WHERE "supplierSource"='CJ' ORDER BY id DESC LIMIT 1`)).map((r) => r.id);
const catId = (await q(`SELECT id FROM "Category" WHERE id NOT LIKE 'EPROLO-%' AND "parentId" IS NULL LIMIT 1`))[0]?.id;

const pages = [
  ['homepage', '/'],
  ['catalog', '/products/'],
  ['category', `/products/?categoryId=${catId}`],
  ['product (EPROLO)', `/products/${eproloIds[0]}`],
  ['product (EPROLO 2)', `/products/${eproloIds[1]}`],
  ['product (CJ)', `/products/${cjIds[0]}`],
  ['about', '/about/'],
  ['careers', '/careers/'],
  ['contact', '/contact/'],
  ['login', '/login/'],
  ['rankings', '/rankings/'],
];

const seen = new Map();
for (const [label, path] of pages) {
  const r = await get(path);
  const t = title(r.text), d = desc(r.text), c = canonical(r.text);
  const og = ogTags(r.text), ld = jsonLdTypes(r.text), rb = robotsMeta(r.text);
  const dupT = seen.get(t);
  seen.set(t, label);
  console.log(`\n  ${label}  (HTTP ${r.status})  ${path}`);
  console.log(`    title      : ${t ? t.slice(0, 78) : 'MISSING'}${dupT ? `   !! DUPLICATE of ${dupT}` : ''}`);
  console.log(`    description: ${d ? d.slice(0, 78) : 'MISSING'}`);
  console.log(`    canonical  : ${c ?? 'MISSING'}`);
  console.log(`    robots meta: ${rb ?? '(none)'}`);
  console.log(`    OG tags    : ${og.length ? [...new Set(og)].join(', ') : 'NONE'}`);
  console.log(`    JSON-LD    : ${ld.length ? [...new Set(ld)].join(', ') : 'NONE'}`);
  results.push({ check: `meta:${label}`, status: (t && d && c) ? 'PASS' : 'FAIL', detail: `${t ? '' : 'no title '}${d ? '' : 'no desc '}${c ? '' : 'no canonical'}`.trim() || 'ok' });
}

// ---------------------------------------------------------------- 1. noindex
console.log('\n=== noindex on private pages ===');
for (const p of ['/login/', '/account/', '/forgot-password/']) {
  const r = await get(p);
  const rb = robotsMeta(r.text) ?? '';
  const ok = /noindex/i.test(rb);
  row(`noindex ${p}`, ok ? 'PASS' : 'FAIL', `HTTP ${r.status}, robots="${rb || 'none'}"`);
}

// ---------------------------------------------------------------- 5. soft 404
console.log('\n=== 404 handling ===');
for (const p of ['/products/99999999', '/this-page-does-not-exist-xyz']) {
  const r = await get(p);
  row(`404 for ${p}`, r.status === 404 ? 'PASS' : 'FAIL', `HTTP ${r.status} (soft-404 if 200)`);
}

// ---------------------------------------------------------------- summary
console.log('\n=== SUMMARY ===');
const pass = results.filter((r) => r.status === 'PASS').length;
const fail = results.filter((r) => r.status === 'FAIL').length;
console.log(`  PASS ${pass}, FAIL ${fail}, INFO ${results.filter((r) => r.status === 'INFO').length}`);
for (const r of results.filter((r) => r.status === 'FAIL')) console.log(`  FAIL: ${r.check} — ${r.detail}`);

await pool.end();
