// Runs the description parser over every stored description, so the PDP change
// is verified against real data before it ships.
//
// The parser is compiled with the actual TypeScript compiler. An earlier
// version of this script "transpiled" it by stripping type annotations with
// regexes; that quietly corrupted the code and reported 85 spec rows across
// 12,746 descriptions. The parser was fine — the harness was not.
import fs from 'fs';
import ts from 'typescript';
import { q, close } from './lib.mjs';

fs.mkdirSync('tools/audit/out', { recursive: true });
fs.writeFileSync(
  'tools/audit/out/_parser.mjs',
  ts.transpileModule(fs.readFileSync('src/lib/productDescription.ts', 'utf8'),
    { compilerOptions: { target: 'ES2022', module: 'ESNext' } }).outputText
);
const { parseDescription } = await import('./out/_parser.mjs?v=' + Date.now());

const rows = await q(`SELECT id, name, description FROM "Product" WHERE description IS NOT NULL`);
let noSpecs = 0, withChart = 0, withProse = 0, totalSpecs = 0, empty = 0, leftover = 0;
const labelFreq = new Map();
const emptySamples = [], leftoverSamples = [];
for (const r of rows) {
  const p = parseDescription(r.description);
  if (!p.specs.length) noSpecs++;
  if (p.sizeChart) withChart++;
  if (p.paragraphs.length) withProse++;
  totalSpecs += p.specs.length;
  if (!p.specs.length && !p.sizeChart && !p.paragraphs.length) {
    empty++;
    if (emptySamples.length < 3) emptySamples.push(r);
  }
  for (const s of p.specs) labelFreq.set(s.label, (labelFreq.get(s.label) || 0) + 1);
  const all = [...p.specs.flatMap((s) => [s.label, s.value]), ...p.paragraphs,
               ...(p.sizeChart ? [...p.sizeChart.headers, ...p.sizeChart.rows.flat()] : [])];
  const bad = all.find((t) => /<[a-zA-Z/][a-zA-Z0-9]*[ >/]/.test(t) || /&[a-z]+;/i.test(t));
  if (bad) { leftover++; if (leftoverSamples.length < 5) leftoverSamples.push({ id: r.id, bad }); }
}
console.log(`descriptions parsed : ${rows.length}`);
console.log(`  with specs        : ${rows.length - noSpecs}`);
console.log(`  with size chart   : ${withChart}`);
console.log(`  with prose        : ${withProse}`);
console.log(`  parsed to NOTHING : ${empty}`);
console.log(`  residual markup   : ${leftover}   <-- must be 0`);
console.log(`  avg specs/product : ${(totalSpecs / rows.length).toFixed(1)}`);
console.log('\ntop spec labels:');
for (const [k, v] of [...labelFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log('  ' + String(v).padStart(6), k);
}
for (const s of emptySamples) console.log('\nEMPTY  ', s.id, JSON.stringify(s.description).slice(0, 120));
for (const s of leftoverSamples) console.log('\nMARKUP ', s.id, JSON.stringify(s.bad).slice(0, 160));
await close();
