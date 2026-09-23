import { spawn } from 'node:child_process';

// What is inside each long task?
//
//   node tools/audit/75-long-task-owners.mjs <url>
//
// 74 showed 8-12 tasks over 50ms after FCP, several of them late (11s, 17s,
// 20s) and large enough to stop a 5s quiet window ever opening. It names when
// they happen, not what they are. This nests the trace's other events inside
// each long task by timestamp and reports the biggest contributor, with the
// script function where there is one.

const url = process.argv[2] ?? 'http://localhost:3000/';
const RUN_MS = 25000;
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9454);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-lt-${Date.now()}`, 'about:blank',
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
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
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

const xs = ev.filter((e) => e.ph === 'X' && e.dur > 0 && e.ts >= t0);
const tasks = xs.filter((e) => e.name === 'RunTask')
  .map((e) => ({ ts: e.ts, s: (e.ts - t0) / 1000, d: e.dur / 1000, end: e.ts + e.dur }))
  .sort((a, b) => a.s - b.s);
const top = [];
let end = -1;
for (const t of tasks) { if (t.ts >= end) { top.push(t); end = t.end; } }
const longs = top.filter((t) => t.d > 50).sort((a, b) => b.d - a.d).slice(0, 10);

const others = xs.filter((e) => e.name !== 'RunTask');
console.log(`LONG TASK OWNERS — ${url}   (4x CPU, 1.6Mbps)\n`);
console.log('   at ms   dur ms   dominant contents');
console.log('  ' + '-'.repeat(84));
for (const t of longs) {
  const inside = others.filter((e) => e.ts >= t.ts && e.ts + e.dur <= t.end);
  const by = new Map();
  for (const e of inside) {
    const d = e.args?.data ?? {};
    const key = e.name === 'FunctionCall'
      ? `FunctionCall ${d.functionName || '(anon)'} ${String(d.url || '').split('/').pop()?.split('?')[0] || ''}`
      : e.name;
    const v = by.get(key) || 0;
    by.set(key, v + e.dur / 1000);
  }
  const parts = [...by].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, v]) => `${k.slice(0, 42)} ${Math.round(v)}ms`);
  console.log('  ' + String(Math.round(t.s)).padStart(6) + String(Math.round(t.d)).padStart(9) + '   ' + (parts[0] || '(no traced children)'));
  for (const p of parts.slice(1)) console.log(' '.repeat(20) + p);
}

ws.close();
browser.kill();
