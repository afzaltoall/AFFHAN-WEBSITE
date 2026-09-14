import fs from 'node:fs';
import path from 'node:path';

// Audit the four non-location pages the way the location pages were audited.
//
//   node tools/audit/106-core-pages.mjs [origin]
//
// Same checklist: title/description/H1 with lengths, word count, schema types,
// and keyword coverage. Reads the LIVE html rather than the sources, because
// the location audit's source-based pass got cross-links wrong — they came
// from a shared component and the grep never saw them.

const origin = (process.argv[2] ?? 'https://affhan.com').replace(/\/$/, '');
const OUT = process.env.TEMP + '/affhan-core-audit';
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['', 'Home', 'src/app/page.tsx'],
  ['about', 'About', 'src/app/about/page.tsx'],
  ['contact', 'Contact', 'src/app/contact/page.tsx'],
  ['careers', 'Careers', 'src/app/careers/page.tsx'],
];

// What someone would plausibly type to land on each of these.
const KW = {
  Home: [
    ['brand "affhan"', /affhan/i],
    ['sourcing company', /sourcing compan/i],
    ['sourcing agent', /sourcing agent/i],
    ['import/export', /import export|import and export/i],
    ['logistics', /logistic/i],
    ['freight', /freight/i],
    ['b2b', /b2b|business[- ]to[- ]business/i],
    ['marketplace/platform', /marketplace|platform/i],
    ['supplier/manufacturer', /supplier|manufactur/i],
    ['india', /india/i],
  ],
  About: [
    ['brand "affhan"', /affhan/i],
    ['history/since', /since \d{4}|founded|history|years/i],
    ['who we are/about', /about us|who we are/i],
    ['legit/trust signals', /review|rating|verified|trusted|registered/i],
    ['ownership/leadership', /founder|chairman|managing director|owner|leadership|director/i],
    ['sourcing company', /sourcing compan/i],
    ['offices/global', /office|global|worldwide/i],
    ['import/export', /import export|import and export/i],
  ],
  Contact: [
    ['brand "affhan"', /affhan/i],
    ['phone number', /\+\d{2}|tel:|phone|call us/i],
    ['address', /address|road|street|chennai|royapuram/i],
    ['email', /@affhan|email/i],
    ['support/enquiry', /support|enquiry|inquiry|help/i],
    ['office hours', /hours|monday|mon\s*[-–]|open/i],
    ['whatsapp', /whatsapp/i],
    ['quote/rfq', /quote|rfq/i],
  ],
  Careers: [
    ['brand "affhan"', /affhan/i],
    ['jobs/vacancies', /job|vacanc|opening|position|role/i],
    ['careers', /career/i],
    ['apply', /apply|application|cv|resume/i],
    ['chennai/location', /chennai|india|guangzhou|dubai/i],
    ['sourcing/logistics roles', /sourcing|logistic|freight|procurement/i],
    ['benefits/culture', /benefit|culture|team|grow|training/i],
    ['hiring', /hiring|recruit/i],
  ],
};

const dec = (x) =>
  (x || '')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x2014;/g, '—')
    .replace(/&#[0-9a-fA-Fx]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Strip tags the way a browser lays them out, not the way a regex wants to.
//
// Replacing EVERY tag with a space is wrong for inline elements. The careers
// <h1> is authored as `Grow <em>without limits</em>, with <em>Affhan</em>.`,
// which a browser renders as "Grow without limits, with Affhan." — but the
// naive strip reported "without limits , with Affhan .", and that phantom
// spacing was very nearly "fixed" in the page itself. Inline elements
// introduce no word boundary; block elements do.
const INLINE_TAG =
  /^<\/?(?:a|abbr|b|bdi|bdo|cite|code|data|dfn|em|i|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr)\b[^>]*>$/i;
const stripTags = (html) => (html || '').replace(/<[^>]+>/g, (tag) => (INLINE_TAG.test(tag) ? '' : ' '));

const rows = [];
for (const [slug, label, srcPath] of PAGES) {
  const url = `${origin}/${slug}${slug ? '/' : ''}`;
  const file = path.join(OUT, `${label}.html`);
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; audit)' } });
  const html = await res.text();
  fs.writeFileSync(file, html);

  const title = dec((/<title>([^<]*)<\/title>/.exec(html) || [])[1]);
  const desc = dec((/<meta name="description" content="([^"]*)"/.exec(html) || [])[1]);
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => dec(stripTags(m[1])));
  const canonical = (/<link rel="canonical" href="([^"]*)"/.exec(html) || [])[1] ?? null;

  const body = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
  const text = stripTags(body).replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();

  const schemaTypes = [...html.matchAll(/"@type"\s*:\s*"([A-Za-z]+)"/g)].map((m) => m[1]);
  const counted = schemaTypes.reduce((a, t) => ((a[t] = (a[t] || 0) + 1), a), {});

  rows.push({
    label, url, status: res.status, title, desc, h1s, canonical, text,
    words: text.split(' ').length,
    schema: counted,
    src: fs.existsSync(srcPath) ? fs.readFileSync(srcPath, 'utf8').split('\n').length : null,
  });
}

console.log(`CORE PAGE AUDIT — ${origin}\n`);
for (const r of rows) {
  console.log(`${r.label}  ${r.url}  [${r.status}]`);
  console.log(`  TITLE (${r.title.length})  ${r.title || '(none)'}`);
  console.log(`  DESC  (${r.desc.length})  ${r.desc || '(none)'}`);
  console.log(`  H1    ${r.h1s.length ? r.h1s.map((h) => `"${h.slice(0, 90)}"`).join(' + ') : '(NONE)'}`);
  console.log(`  canonical: ${r.canonical ?? '(none)'}`);
  console.log(`  words: ${r.words}   source lines: ${r.src ?? '?'}`);
  const s = Object.entries(r.schema).sort((a, b) => b[1] - a[1]);
  console.log(`  schema: ${s.length ? s.map(([t, n]) => `${t}${n > 1 ? '×' + n : ''}`).join(', ') : 'NONE'}`);
  console.log('');
}

console.log('\nKEYWORD COVERAGE — whole page text\n');
for (const r of rows) {
  const list = KW[r.label] || [];
  const blob = [r.title, r.desc, ...r.h1s, r.text].join(' ');
  const miss = list.filter(([, re]) => !re.test(blob)).map(([k]) => k);
  const hit = list.filter(([, re]) => re.test(blob)).map(([k]) => k);
  console.log(`  ${r.label}`);
  console.log(`    present: ${hit.join(', ') || '(none)'}`);
  console.log(`    MISSING: ${miss.join(', ') || 'none'}`);
  // Metadata is what shows in results, so check it separately from body text.
  const metaBlob = [r.title, r.desc, ...r.h1s].join(' ');
  const metaMiss = list.filter(([, re]) => !re.test(metaBlob)).map(([k]) => k);
  console.log(`    absent from title/desc/h1: ${metaMiss.join(', ') || 'none'}`);
  console.log('');
}
