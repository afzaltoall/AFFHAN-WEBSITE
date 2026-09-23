import { spawn } from 'node:child_process';

// The same trace as 58, split by phase.
//
//   node tools/audit/61-trace-phases.mjs <url>
//
// 58 aggregated a 20s window, which mixes two unrelated problems: the work that
// delays first paint, and the work the page keeps doing forever afterwards.
// Only the first affects LCP; only the second affects GTmetrix's CPU-idle
// check. Bucketing by time since navigation keeps them apart.

const url = process.argv[2] ?? 'https://affhan.com/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9444);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-tp-${Date.now()}`, 'about:blank',
], { stdio: 'ignore' });

async function firstPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const p = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === 'page');
      if (p.length) return p[0];
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
const ev = [];
let collecting = false;
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Tracing.dataCollected') ev.push(...m.params.value);
  if (m.method === 'Tracing.tracingComplete') collecting = false;
};
const send = (mm, p = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: mm, params: p })); });

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });

collecting = true;
await send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
await send('Page.navigate', { url });
await sleep(22000);
await send('Tracing.end');
for (let i = 0; i < 40 && collecting; i++) await sleep(250);

// navigationStart, in the trace's own microsecond clock.
const nav = ev.find((e) => e.name === 'navigationStart');
// Spreading ~190k timestamps into Math.min overflows the call stack; fold instead.
const t0 = nav ? nav.ts : ev.reduce((m, e) => (e.ts && e.ts < m ? e.ts : m), Infinity);

// RunTask wraps everything else, so counting it alongside its children would
// double-count. Report it separately as the total.
const BUCKETS = [
  ['0-2s   load', 0, 2e6],
  ['2-6s   hydrate/settle', 2e6, 6e6],
  ['6-22s  IDLE', 6e6, 22e6],
];

for (const [label, lo, hi] of BUCKETS) {
  const by = new Map();
  let total = 0;
  for (const e of ev) {
    if (e.ph !== 'X' || typeof e.dur !== 'number') continue;
    const rel = e.ts - t0;
    if (rel < lo || rel >= hi) continue;
    if (e.name === 'RunTask') { total += e.dur / 1000; continue; }
    const v = by.get(e.name) || { ms: 0, n: 0 };
    v.ms += e.dur / 1000; v.n++; by.set(e.name, v);
  }
  console.log(`\n=== ${label}   —   ${Math.round(total)} ms of main-thread tasks ===`);
  console.log('  EVENT'.padEnd(38) + 'ms'.padStart(8) + 'count'.padStart(9));
  for (const [k, v] of [...by].sort((a, b) => b[1].ms - a[1].ms).slice(0, 9)) {
    console.log('  ' + k.slice(0, 35).padEnd(36) + String(Math.round(v.ms)).padStart(8) + String(v.n).padStart(9));
  }
}

ws.close();
browser.kill();
