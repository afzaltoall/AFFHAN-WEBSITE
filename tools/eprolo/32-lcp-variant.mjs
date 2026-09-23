import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

// Runs 33-lcp-timeline.mjs N times against one URL and reports the distribution.
//
//   THROTTLE=1 node tools/eprolo/32-lcp-variant.mjs <label> [runs] [url]
//
// The point of this wrapper is the discipline, not the arithmetic. An earlier
// pass on this page drew a conclusion from a 3-run sample that turned out to be
// luck; every number below is reported with its spread so the next reader can
// see whether a difference is real or is variance.
//
// It also splits the runs in two. The homepage's LCP is an above-the-fold
// product image, and on a throttled connection that image sometimes never
// arrives inside the observation window — those runs report a ~1.5s heading as
// the largest paint, which is not a fast page but an unfinished measurement.
// Averaging the two regimes together produced a 14s spread and hid everything.
// Only image-final runs are comparable between variants.
//
// Results append to tools/eprolo/moderation/lcp-variants.json.

const LABEL = process.argv[2] ?? 'control';
const RUNS = Number(process.argv[3] ?? 5);
const URL_ARG = process.argv[4] ?? 'http://localhost:3000/';
const OUT = 'tools/eprolo/moderation/lcp-variants.json';

const runs = [];
for (let i = 1; i <= RUNS; i++) {
  const r = spawnSync(process.execPath, ['tools/eprolo/33-lcp-timeline.mjs', URL_ARG], {
    encoding: 'utf8',
    // Separate ports so a browser left behind by a killed run cannot be
    // attached to by the next one.
    env: { ...process.env, CDP_PORT: String(9450 + i) },
    timeout: 180000,
  });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const m = /SUMMARY lcp=([\d.]+) tag=(\S+) area=(\d+) imgs=(\d+) finalIsImage=(\w+)/.exec(out);
  if (!m) { console.log(`  run ${i}: PROBE FAILED\n${out.slice(-400)}`); continue; }
  const rec = { lcp: Number(m[1]), tag: m[2], area: Number(m[3]), imgs: Number(m[4]), isImage: m[5] === 'true' };
  runs.push(rec);
  console.log(`  run ${i}: LCP ${rec.lcp.toFixed(2)}s  <- ${rec.tag} (${rec.area}px²)  ${rec.imgs} image responses${rec.isImage ? '' : '   [INCOMPLETE — image never painted]'}`);
}

if (!runs.length) { console.error('no successful runs'); process.exit(1); }

const stat = (arr) => {
  const v = [...arr].sort((a, b) => a - b);
  if (!v.length) return null;
  const median = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return { n: v.length, min: v[0], median, max: v[v.length - 1], mean: v.reduce((s, x) => s + x, 0) / v.length };
};

// With BLOCK_CDN_IMAGES the text LCP is the measurement, not a failed run:
// the product photos are deliberately gone, so nothing else can win.
const valid = process.env.BLOCK_CDN_IMAGES ? runs : runs.filter((r) => r.isImage);
const v = stat(valid.map((r) => r.lcp));

console.log(`\n=== ${LABEL} (${runs.length} runs, ${URL_ARG}, throttled=${!!process.env.THROTTLE}) ===`);
if (v) {
  console.log(`  image-final runs : ${v.n}/${runs.length}`);
  console.log(`  LCP  median ${v.median.toFixed(2)}s   mean ${v.mean.toFixed(2)}s   range ${v.min.toFixed(2)}-${v.max.toFixed(2)}s   spread ${(v.max - v.min).toFixed(2)}s`);
} else {
  console.log(`  image-final runs : 0/${runs.length} — no comparable sample`);
}
const incomplete = runs.length - valid.length;
if (incomplete) console.log(`  ${incomplete} run(s) ended with a text LCP (image never arrived) — excluded`);

const record = { label: LABEL, url: URL_ARG, at: new Date().toISOString(), throttled: !!process.env.THROTTLE, runs, lcpImageFinal: v };
fs.mkdirSync('tools/eprolo/moderation', { recursive: true });
const all = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
all.push(record);
fs.writeFileSync(OUT, JSON.stringify(all, null, 2));
console.log(`  appended to ${OUT}`);
