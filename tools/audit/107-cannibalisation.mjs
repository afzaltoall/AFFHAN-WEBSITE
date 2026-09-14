import fs from 'node:fs';

// Do the four core pages compete with the eight location pages?
//
//   node tools/audit/107-cannibalisation.mjs
//
// Same failure that had china-sourcing-company, the Guangzhou page and
// sourcing-from-china all leading on "China Sourcing": when two pages chase
// one phrase, Google picks one and the other's authority is wasted. The
// location pages now own "sourcing company in <city>". The question is whether
// anything else claims those phrases too.

const origin = process.argv[2] ?? "https://affhan.com";
const CORE = [['', 'Home'], ['about', 'About'], ['contact', 'Contact'], ['careers', 'Careers']];
const LOCATIONS = ['chennai', 'dubai', 'singapore', 'malaysia', 'london', 'guangzhou'];

const dec = (x) => (x || '').replace(/&amp;/g, '&').replace(/&#[0-9a-fA-Fx]+;/g, ' ').replace(/\s+/g, ' ').trim();

// Inline elements introduce no word boundary; block elements do. Replacing
// every tag with a space invented spacing that is not on the page — see the
// longer note in 106-core-pages.mjs, where it cost a near-miss "fix".
const INLINE_TAG =
  /^<\/?(?:a|abbr|b|bdi|bdo|cite|code|data|dfn|em|i|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr)\b[^>]*>$/i;
const stripTags = (html) => (html || '').replace(/<[^>]+>/g, (tag) => (INLINE_TAG.test(tag) ? '' : ' '));

const pages = [];
for (const [slug, label] of CORE) {
  const html = await (await fetch(`${origin}/${slug}${slug ? '/' : ''}`)).text();
  const title = dec((/<title>([^<]*)<\/title>/.exec(html) || [])[1]);
  const desc = dec((/<meta name="description" content="([^"]*)"/.exec(html) || [])[1]);
  const h1 = dec(stripTags((/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html) || [])[1]));
  const body = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
  const text = stripTags(body).replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
  pages.push({ label, title, desc, h1, text, meta: [title, desc, h1].join(' ') });
}

console.log('CITY CLAIMS IN THE CORE PAGES\n');
console.log('  page'.padEnd(12) + 'where'.padEnd(16) + 'city phrases found');
console.log('  ' + '-'.repeat(76));
for (const p of pages) {
  // The competing shape is "sourcing|import|export ... <city>" close together.
  const inMeta = LOCATIONS.filter((c) => new RegExp(`(sourcing|import|export|freight|logistics)[^.]{0,40}${c}|${c}[^.]{0,40}(sourcing|import|export)`, 'i').test(p.meta));
  const inBody = LOCATIONS.filter((c) => new RegExp(`sourcing (company|agent) in ${c}`, 'i').test(p.text));
  const mentions = LOCATIONS.filter((c) => new RegExp(c, 'i').test(p.text));
  console.log('  ' + p.label.padEnd(12) + 'title/desc/h1'.padEnd(16) + (inMeta.length ? inMeta.join(', ') + '   <<< COMPETES' : 'none'));
  console.log('  ' + ''.padEnd(12) + 'body exact'.padEnd(16) + (inBody.length ? inBody.join(', ') + '   <<< COMPETES' : 'none'));
  console.log('  ' + ''.padEnd(12) + 'body mentions'.padEnd(16) + (mentions.join(', ') || 'none'));
  console.log('');
}

console.log('\nHEAD-PHRASE OWNERSHIP — who claims what in title/desc/h1\n');
const PHRASES = [
  ['sourcing company (generic)', /sourcing compan/i],
  ['sourcing agent (generic)', /sourcing agent/i],
  ['b2b / marketplace / platform', /b2b|marketplace|platform/i],
  ['import export', /import export|import and export/i],
  ['logistics', /logistic/i],
];
for (const p of pages) {
  const has = PHRASES.filter(([, re]) => re.test(p.meta)).map(([k]) => k);
  console.log(`  ${p.label.padEnd(10)} ${has.join(' | ') || '(none of the commercial phrases)'}`);
}
