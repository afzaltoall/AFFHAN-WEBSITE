import { spawn } from 'node:child_process';

// Where the load-phase main-thread time goes, by second.
//
//   node tools/audit/67-load-attribution.mjs <url>
//
// The three suspects under discussion (beads, content-visibility, TextMorph)
// are all steady-state costs, and steady state turns out to be nearly free:
// after 12s the page does ~14 style recalcs and zero paints in 20 seconds.
// So the work that matters is in the load window, which is also the window
// Lighthouse models for LCP and the one GTmetrix waits on for a quiet thread.
//
// Per-second buckets show when the thread is busy, and the function breakdown
// shows what is running while it is.

const url = process.argv[2] ?? 'https://affhan.com/';
const RUN_MS = 20000;
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9450);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-la-${Date.now()}`, 'about:blank',
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
await send('Network.enable');
await send('Network.emulateNetworkConditions', {
  offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
});

collecting = true;
await send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
await send('Page.navigate', { url });
await sleep(RUN_MS);
await send('Tracing.end');
for (let i = 0; i < 60 && collecting; i++) await sleep(250);

const nav = ev.find((e) => e.name === 'navigationStart');
const t0 = nav ? nav.ts : ev.reduce((m, e) => (e.ts && e.ts < m ? e.ts : m), Infinity);

// Top-level RunTask only (no nested ones) — the real main-thread occupancy.
const tasks = ev.filter((e) => e.name === 'RunTask' && e.ph === 'X' && e.dur > 0)
  .map((e) => ({ s: (e.ts - t0) / 1000, d: e.dur / 1000 }))
  .filter((t) => t.s >= 0 && t.s < RUN_MS)
  .sort((a, b) => a.s - b.s);
const top = [];
let end = -1;
for (const t of tasks) { if (t.s >= end) { top.push(t); end = t.s + t.d; } }

console.log(`LOAD ATTRIBUTION — ${url}   (4x CPU, 1.6Mbps/150ms)\n`);
console.log('  second   busy ms   longest   tasks   bar');
console.log('  ' + '-'.repeat(70));
for (let s = 0; s < RUN_MS / 1000; s++) {
  const inSec = top.filter((t) => t.s >= s * 1000 && t.s < (s + 1) * 1000);
  const busy = Math.round(inSec.reduce((a, t) => a + t.d, 0));
  const longest = Math.round(Math.max(0, ...inSec.map((t) => t.d)));
  console.log('  ' + String(s).padStart(6) + String(busy).padStart(10) + String(longest).padStart(10) +
    String(inSec.length).padStart(8) + '   ' + '#'.repeat(Math.min(40, Math.round(busy / 25))));
}

// The longest gap with no task at all — what GTmetrix is looking for.
let bestGap = 0, bestAt = 0;
for (let i = 1; i < top.length; i++) {
  const gap = top[i].s - (top[i - 1].s + top[i - 1].d);
  if (gap > bestGap) { bestGap = gap; bestAt = top[i - 1].s + top[i - 1].d; }
}
console.log(`\n  longest idle gap: ${Math.round(bestGap)} ms, starting at ${Math.round(bestAt)} ms`);
console.log(`  total busy: ${Math.round(top.reduce((a, t) => a + t.d, 0))} ms of ${RUN_MS} ms`);

// What ran during the first 12s.
const byName = new Map();
for (const e of ev) {
  if (e.ph !== 'X' || !(e.dur > 0)) continue;
  const rel = (e.ts - t0) / 1000;
  if (rel < 0 || rel >= 12000) continue;
  if (e.name === 'RunTask') continue;
  const d = e.args?.data ?? {};
  const key = e.name === 'FunctionCall'
    ? `FunctionCall ${d.functionName || '(anon)'} ${String(d.url || '').split('/').pop()?.split('?')[0] || ''}`
    : e.name;
  const v = byName.get(key) || { ms: 0, n: 0 };
  v.ms += e.dur / 1000; v.n++; byName.set(key, v);
}
console.log('\n  FIRST 12s — top costs'.padEnd(58) + 'ms'.padStart(8) + 'count'.padStart(8));
console.log('  ' + '-'.repeat(72));
for (const [k, v] of [...byName].sort((a, b) => b[1].ms - a[1].ms).slice(0, 14)) {
  console.log('  ' + k.slice(0, 54).padEnd(56) + String(Math.round(v.ms)).padStart(8) + String(v.n).padStart(8));
}

ws.close();
browser.kill();
