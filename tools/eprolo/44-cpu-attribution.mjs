import { spawn } from 'node:child_process';
import fs from 'node:fs';

// Which functions actually burn the main thread during load?
//
//   node tools/eprolo/44-cpu-attribution.mjs [url]
//
// The longtask observer only ever says "unknown:window", which is how a
// framer-motion removal got shipped that turned out to save nothing. This takes
// a real V8 CPU profile and aggregates self-time by script, so the next change
// is aimed at whatever is actually at the top of the list.

const URL_ARG = process.argv[2] ?? 'http://localhost:3000/';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9610);
const DURATION = Number(process.env.DURATION ?? 14000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROFILE = `${process.env.TEMP}\\edge-cpu-${PORT}-${Date.now()}`;
const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--disable-gpu',
  '--disable-extensions', '--disable-component-extensions-with-background-pages',
  `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' });

async function firstPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === 'page');
      if (pages.length) return pages[0];
    } catch {}
    await sleep(500);
  }
  throw new Error('no CDP page');
}

const target = await firstPage();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) =>
  new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

await send('Page.enable');
await send('Profiler.enable');
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
// 100us sampling: fine enough to separate parse from render without the
// profiler itself distorting the run.
await send('Profiler.setSamplingInterval', { interval: 100 });
await send('Profiler.start');
await send('Page.navigate', { url: URL_ARG });
await sleep(DURATION);
const { result } = await send('Profiler.stop');

const p = result.profile;
const byId = new Map(p.nodes.map((n) => [n.id, n]));

// Self time per node, from the sample deltas.
const self = new Map();
for (let i = 0; i < p.samples.length; i++) {
  const t = p.timeDeltas[i] ?? 0;
  self.set(p.samples[i], (self.get(p.samples[i]) ?? 0) + t);
}

const byScript = new Map();
const byFunction = new Map();
for (const [nodeId, us] of self) {
  const n = byId.get(nodeId);
  if (!n) continue;
  const cf = n.callFrame;
  const url = cf.url || `(${cf.functionName || 'internal'})`;
  const short = url.startsWith('http') ? url.split('/').pop().split('?')[0] : url;
  byScript.set(short, (byScript.get(short) ?? 0) + us);
  const fn = `${cf.functionName || '(anonymous)'}  ${short}`;
  byFunction.set(fn, (byFunction.get(fn) ?? 0) + us);
}

const total = [...self.values()].reduce((a, b) => a + b, 0);
const ms = (us) => (us / 1000).toFixed(0).padStart(6) + ' ms';
const pct = (us) => ((us / total) * 100).toFixed(1).padStart(5) + '%';

console.log(`\n=== ${URL_ARG}  (4x CPU, ${DURATION / 1000}s window) ===`);
console.log(`total sampled main-thread time: ${(total / 1000).toFixed(0)} ms\n`);

console.log('by script:');
for (const [s, us] of [...byScript.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
  console.log(`  ${ms(us)}  ${pct(us)}  ${s}`);
}

console.log('\nby function (self time):');
for (const [f, us] of [...byFunction.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  if (us < 3000) continue;
  console.log(`  ${ms(us)}  ${pct(us)}  ${f.slice(0, 90)}`);
}

ws.close();
browser.kill();
await sleep(600);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
