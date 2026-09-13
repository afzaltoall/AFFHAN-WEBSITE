import fs from 'node:fs';
import path from 'node:path';

// What do the location landing pages have, and what is missing?
//
//   node tools/audit/104-location-pages.mjs
//
// Chennai and Dubai rank #1 for "sourcing company in <city>" and carry five
// things the others may not: a visible Google-rating trust block, genuinely
// local narrative rather than templated filler, FAQPage schema, cross-links to
// the sibling location pages, and a LocalBusiness NAP in JSON-LD.
//
// This reads the sources rather than the rendered pages, because the question
// is what each file declares — schema and metadata are easier to compare
// honestly at the source than scraped back out of HTML.

const PAGES = [
  ['sourcing-company-chennai', 'Chennai', true],
  ['sourcing-company-dubai', 'Dubai', true],
  ['sourcing-company-singapore', 'Singapore', false],
  ['sourcing-company-malaysia', 'Malaysia', false],
  ['sourcing-company-uk', 'UK / London', false],
  ['china-sourcing-company', 'China', false],
  ['china-sourcing-office-guangzhou', 'Guangzhou', false],
  ['sourcing-from-china', 'Sourcing from China', false],
];

// The long-tail phrases real searches are using, beyond the one we rank for.
const KEYWORDS = [
  ['sourcing company', /sourcing compan/i],
  ['sourcing agent', /sourcing agent/i],
  ['import export', /import[\s-]?(and\s)?export|import\/export/i],
  ['shipping company', /shipping compan/i],
  ['logistics', /logistic/i],
  ['freight', /freight/i],
  ['procurement', /procurement/i],
];

const read = (slug) => {
  const p = path.join('src', 'app', slug, 'page.tsx');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};

// Pull the string value of a metadata field, tolerating template literals.
const field = (src, name) => {
  const re = new RegExp(`${name}\\s*:\\s*(\`[^\`]*\`|"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`);
  const m = re.exec(src);
  return m ? m[1].slice(1, -1).replace(/\s+/g, ' ').trim() : null;
};

const rows = [];
for (const [slug, label, isReference] of PAGES) {
  const src = read(slug);
  if (!src) { rows.push({ label, slug, missing: ['PAGE DOES NOT EXIST'] }); continue; }

  const crossLinks = [...src.matchAll(/href="\/(sourcing-company-[a-z]+|china-sourcing-[a-z-]+|sourcing-from-china)\//g)]
    .map((m) => m[1])
    .filter((s) => s !== slug);

  rows.push({
    label,
    slug,
    isReference,
    lines: src.split('\n').length,
    trustBlock: /<GoogleRating/.test(src),
    faqSchema: /"@type":\s*"FAQPage"/.test(src),
    localBusiness: /"@type":\s*"LocalBusiness"/.test(src),
    nap: /telephone:/.test(src) && /address:\s*postalAddress|address:\s*\{/.test(src),
    areaServed: /areaServed/.test(src),
    crossLinks: new Set(crossLinks).size,
    title: field(src, 'title'),
    description: field(src, 'description'),
    h1: (() => {
      const m = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(src);
      if (!m) return null;
      return m[1].replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
    })(),
  });
}

const yn = (b) => (b ? 'yes' : 'NO ');
console.log('CHECKLIST — the five things Chennai and Dubai have\n');
console.log('  page'.padEnd(22) + 'lines'.padStart(7) + '  trust  FAQ   NAP   areaSrv  x-links');
console.log('  ' + '-'.repeat(70));
for (const r of rows) {
  if (r.missing) { console.log('  ' + r.label.padEnd(20) + '  ' + r.missing[0]); continue; }
  console.log(
    '  ' + (r.label + (r.isReference ? ' *' : '')).padEnd(20) +
    String(r.lines).padStart(7) + '   ' +
    yn(r.trustBlock) + '   ' + yn(r.faqSchema) + '  ' + yn(r.localBusiness && r.nap) + '   ' +
    yn(r.areaServed) + '     ' + String(r.crossLinks).padStart(2)
  );
}
console.log('\n  * = the two that already rank #1');

console.log('\n\nKEYWORD COVERAGE — title + description + h1 together\n');
const header = '  page'.padEnd(22) + KEYWORDS.map(([k]) => k.split(' ')[0].slice(0, 8).padStart(9)).join('');
console.log(header);
console.log('  ' + '-'.repeat(header.length));
for (const r of rows) {
  if (r.missing) continue;
  const blob = [r.title, r.description, r.h1].filter(Boolean).join(' ');
  const marks = KEYWORDS.map(([, re]) => (re.test(blob) ? '        y' : '        .')).join('');
  console.log('  ' + r.label.padEnd(20) + marks);
}
console.log('\n  y = present   . = absent');

console.log('\n\nCURRENT METADATA, verbatim\n');
for (const r of rows) {
  if (r.missing) continue;
  console.log(`  ${r.label}  (/${r.slug}/)`);
  console.log(`    title : ${r.title ?? '(none found)'}`);
  console.log(`    desc  : ${(r.description ?? '(none found)').slice(0, 150)}`);
  console.log(`    h1    : ${r.h1 ?? '(none found)'}`);
  console.log(`    title length: ${r.title ? r.title.length : 0} chars, desc: ${r.description ? r.description.length : 0} chars`);
  console.log('');
}
