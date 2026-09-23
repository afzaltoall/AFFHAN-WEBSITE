// What does production actually serve for the landing pages, to Googlebot and
// to a browser?
//
//   node tools/audit/98-seo-headcheck.mjs
//
// READ-ONLY. Fetches and reports: status, redirect chain, title, meta robots,
// x-robots-tag, canonical, og:url, JSON-LD @types, H1, and whether the body
// copy is in the server HTML at all. Two user agents, so cloaking or a
// bot-only block shows up as a difference rather than a hunch.

const UA_BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const PAGES = [
  ['home', 'https://affhan.com/'],
  ['dubai', 'https://affhan.com/sourcing-company-dubai/'],
  ['chennai', 'https://affhan.com/sourcing-company-chennai/'],
  ['uk', 'https://affhan.com/sourcing-company-uk/'],
  ['china', 'https://affhan.com/china-sourcing-company/'],
];

const pick = (html, re) => (html.match(re)?.[1] ?? '').trim();

async function chain(url, ua) {
  const hops = [];
  let current = url;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(current, { headers: { 'User-Agent': ua }, redirect: 'manual' });
    hops.push({ url: current, status: r.status, location: r.headers.get('location'), xrobots: r.headers.get('x-robots-tag') });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      current = new URL(r.headers.get('location'), current).toString();
      continue;
    }
    const html = await r.text();
    return { hops, final: current, status: r.status, html, headers: r.headers };
  }
  return { hops, final: current, status: 0, html: '', headers: new Headers() };
}

function describe(html) {
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap((m) => {
      try {
        const j = JSON.parse(m[1]);
        const arr = Array.isArray(j) ? j : (j['@graph'] ?? [j]);
        return arr.map((x) => x['@type']).flat();
      } catch { return ['(unparseable)']; }
    });
  return {
    title: pick(html, /<title>([^<]*)<\/title>/),
    robots: pick(html, /<meta name="robots" content="([^"]*)"/),
    canonical: pick(html, /<link rel="canonical" href="([^"]*)"/),
    ogUrl: pick(html, /<meta property="og:url" content="([^"]*)"/),
    h1: pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    ld: [...new Set(ld)].join(', '),
    bytes: html.length,
    words: html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length,
  };
}

for (const [name, url] of PAGES) {
  console.log(`\n${'='.repeat(78)}\n${name.toUpperCase()}  ${url}\n${'='.repeat(78)}`);
  const out = {};
  for (const [label, ua] of [['googlebot', UA_BOT], ['browser', UA_BROWSER]]) {
    const r = await chain(url, ua);
    const d = describe(r.html);
    out[label] = { ...d, status: r.status, hops: r.hops, xrobots: r.headers.get('x-robots-tag') };
    console.log(`\n  --- ${label}`);
    console.log(`  status        ${r.status}`);
    console.log(`  chain         ${r.hops.map((h) => `${h.status}${h.location ? ' -> ' + h.location : ''}`).join(' | ')}`);
    console.log(`  x-robots-tag  ${r.headers.get('x-robots-tag') ?? '(none)'}`);
    console.log(`  <title>       ${d.title}`);
    console.log(`  meta robots   ${d.robots || '(none)'}`);
    console.log(`  canonical     ${d.canonical || '(none)'}`);
    console.log(`  og:url        ${d.ogUrl || '(none)'}`);
    console.log(`  <h1>          ${d.h1.slice(0, 110)}`);
    console.log(`  JSON-LD       ${d.ld || '(none)'}`);
    console.log(`  html          ${d.bytes} bytes, ~${d.words} words of text`);
  }
  const diffs = ['status', 'title', 'robots', 'canonical', 'ld', 'words']
    .filter((k) => String(out.googlebot[k]) !== String(out.browser[k]));
  console.log(`\n  googlebot vs browser: ${diffs.length === 0 ? 'identical on every field checked' : 'DIFFERS on ' + diffs.join(', ')}`);
}

// The variants that matter for duplicate/canonical trouble.
console.log(`\n${'='.repeat(78)}\nDOMAIN VARIANTS\n${'='.repeat(78)}`);
for (const url of [
  'http://affhan.com/', 'https://affhan.com/', 'http://www.affhan.com/', 'https://www.affhan.com/',
  'https://affhan.com/sourcing-company-dubai', 'https://www.affhan.com/sourcing-company-dubai/',
]) {
  const r = await chain(url, UA_BOT);
  console.log(`  ${url.padEnd(48)} ${r.hops.map((h) => `${h.status}${h.location ? ' -> ' + h.location : ''}`).join(' | ')}`);
}
