// Production state, captured so a merge can be judged against it.
//
//   node tools/audit/120-prod-baseline.mjs <label>
//
// Writes tools/audit/prod/<label>.json and prints the table. Run once before
// merging and once after each deployment; the two files diff cleanly.
//
// Read-only. The employee login POST uses a dummy address that cannot be an
// account, so it exercises the route without touching anybody's credentials.

import fs from 'node:fs';

const LABEL = process.argv[2] ?? 'before';
const ORIGIN = 'https://affhan.com';
const PAGES = ['/', '/sourcing-company-dubai/', '/sourcing-company-chennai/', '/sourcing-company-uk/', '/about/', '/contact/'];
const EMPLOYEE = ['/employee/login/', '/employee/login/?expired=1', '/employee/forgot-password/', '/employee/dashboard/'];

const pick = (h, re) => (h.match(re)?.[1] ?? '').trim();

async function chain(url) {
  const hops = [];
  let cur = url;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(cur, { redirect: 'manual' });
    hops.push({ status: r.status, location: r.headers.get('location') });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      cur = new URL(r.headers.get('location'), cur).toString();
      continue;
    }
    return { hops, final: cur, status: r.status, html: await r.text(), cc: r.headers.get('cache-control') };
  }
  return { hops, final: cur, status: 0, html: '', cc: null };
}

const out = { label: LABEL, at: new Date().toISOString(), pages: [], employee: [], sitemaps: [], loginPost: null };

for (const p of PAGES) {
  const r = await chain(ORIGIN + p);
  // Every JSON-LD block must parse; a merge that breaks one is a merge to undo.
  const blocks = [...r.html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)];
  let bad = 0;
  const types = new Set();
  for (const b of blocks) {
    try {
      const j = JSON.parse(b[1]);
      for (const n of (Array.isArray(j) ? j : j['@graph'] ?? [j])) types.add(n['@type']);
    } catch { bad++; }
  }
  out.pages.push({
    route: p, status: r.status,
    chain: r.hops.map((h) => h.status).join('->'),
    title: pick(r.html, /<title>([^<]*)<\/title>/),
    desc: pick(r.html, /<meta name="description" content="([^"]*)"/),
    canonical: pick(r.html, /<link rel="canonical" href="([^"]*)"/),
    ldBlocks: blocks.length, ldInvalid: bad, ldTypes: [...types].flat().sort().join(','),
    nosnippet: (r.html.match(/data-nosnippet/g)||[]).length,
    nosnippetSpan: /<span data-nosnippet/.test(r.html),
    ogImage: pick(r.html, /<meta property="og:image"[^>]*content="([^"]*)"/),
    statFigures: (r.html.match(/tracking-tight text-white">/g) || []).length,
  });
}

for (const p of EMPLOYEE) {
  const r = await chain(ORIGIN + p);
  out.employee.push({
    route: p, status: r.status,
    chain: r.hops.map((h) => `${h.status}${h.location ? ' -> ' + h.location : ''}`).join(' | '),
    hasTurnstileScript: /challenges\.cloudflare\.com/.test(r.html),
    statFigures: (r.html.match(/tracking-tight text-white">/g) || []).length,
    title: pick(r.html, /<title>([^<]*)<\/title>/),
  });
}

for (const s of ['/sitemap.xml', '/products/sitemap.xml']) {
  const r = await fetch(ORIGIN + s);
  const body = await r.text();
  out.sitemaps.push({ route: s, status: r.status, locs: (body.match(/<loc>/g) || []).length });
}

// A dummy account, so the route is exercised without touching a real one.
{
  const r = await fetch(`${ORIGIN}/api/employee/auth/login/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nobody@example.invalid', password: 'not-a-real-password', turnstileToken: null }),
  });
  let body = null;
  try { body = await r.json(); } catch { body = { __nonJson: true }; }
  out.loginPost = { status: r.status, keys: Object.keys(body ?? {}).sort(), error: typeof body?.error === 'string' ? body.error : undefined };
}

fs.mkdirSync('tools/audit/prod', { recursive: true });
fs.writeFileSync(`tools/audit/prod/${LABEL}.json`, JSON.stringify(out, null, 2));

console.log(`\n=== PUBLIC PAGES (${LABEL})\n`);
for (const p of out.pages) {
  console.log(`  ${p.route.padEnd(30)} ${p.status}  ld ${p.ldBlocks} blocks/${p.ldInvalid} invalid  nosnippet ${p.nosnippet} (span=${p.nosnippetSpan})  og:image ${p.ogImage?"yes":"NO"}`);
  console.log(`     title     ${p.title}`);
  console.log(`     desc      ${p.desc.slice(0, 96)}`);
  console.log(`     canonical ${p.canonical}`);
}
console.log(`\n=== EMPLOYEE (${LABEL})\n`);
for (const e of out.employee) {
  console.log(`  ${e.route.padEnd(34)} ${String(e.status).padEnd(4)} chain ${e.chain}`);
  console.log(`     turnstile-script ${e.hasTurnstileScript}   stat-figures ${e.statFigures}   title "${e.title}"`);
}
console.log(`\n=== SITEMAPS / LOGIN POST (${LABEL})\n`);
for (const s of out.sitemaps) console.log(`  ${s.route.padEnd(26)} ${s.status}  ${s.locs} <loc>`);
console.log(`  POST /api/employee/auth/login/  ${out.loginPost.status}  body keys [${out.loginPost.keys.join(', ')}]  error "${out.loginPost.error ?? ''}"`);
console.log(`\nwritten: tools/audit/prod/${LABEL}.json`);
