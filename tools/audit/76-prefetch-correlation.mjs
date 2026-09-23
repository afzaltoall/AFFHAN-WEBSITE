import { spawn } from 'node:child_process';

// Does the big late React task follow the category prefetch landing?
//
//   node tools/audit/76-prefetch-correlation.mjs <url>
//
// 75 found a ~950ms react-dom task around 7.5s, long after load, which is on
// its own enough to deny Lighthouse the 5s quiet window TTI needs. The obvious
// explanation is the navbar pushing 668 prefetched categories into state and
// rendering a menu nobody has opened — but "obvious" has been wrong twice in
// this investigation, so this lines the two up on one clock instead.

const url = process.argv[2] ?? 'http://localhost:3000/';
const RUN_MS = 22000;
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9455);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-pc-${Date.now()}`, 'about:blank',
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
const net = [];
let collecting = false;
let reqId = null;
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Tracing.dataCollected') ev.push(...m.params.value);
  if (m.method === 'Tracing.tracingComplete') collecting = false;
  if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/api/categories')) {
    reqId = m.params.requestId;
    net.push({ what: 'request sent', t: m.params.timestamp });
  }
  if (m.method === 'Network.loadingFinished' && m.params.requestId === reqId) {
    net.push({ what: 'response finished', t: m.params.timestamp, bytes: m.params.encodedDataLength });
  }
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
// Network timestamps are seconds on a different origin; anchor them to the
// trace clock via ResourceSendRequest, which appears on both.
const anchorTrace = ev.filter((e) => e.name === 'ResourceSendRequest').sort((a, b) => a.ts - b.ts)[0];
const anchorNet = net[0];

const tasks = ev.filter((e) => e.name === 'RunTask' && e.ph === 'X' && e.dur > 0)
  .map((e) => ({ ts: e.ts, s: (e.ts - t0) / 1000, d: e.dur / 1000, end: e.ts + e.dur }))
  .sort((a, b) => a.s - b.s);
const top = [];
let end = -1;
for (const t of tasks) { if (t.ts >= end) { top.push(t); end = t.end; } }

console.log(`PREFETCH vs LONG TASKS — ${url}\n`);
for (const n of net) {
  const rel = anchorNet && anchorTrace ? Math.round((n.t - anchorNet.t) * 1000 + (anchorTrace.ts - t0) / 1000) : null;
  console.log(`  /api/categories ${n.what.padEnd(18)} ~${rel}ms` + (n.bytes ? `  (${Math.round(n.bytes / 1024)} KB)` : ''));
}
const finished = net.find((n) => n.what === 'response finished');
const finRel = finished && anchorNet && anchorTrace
  ? (finished.t - anchorNet.t) * 1000 + (anchorTrace.ts - t0) / 1000 : null;

console.log('\n  long tasks (>50ms), with distance from that response:');
for (const t of top.filter((x) => x.d > 50)) {
  const delta = finRel != null ? Math.round(t.s - finRel) : null;
  const mark = delta != null && delta >= -50 && delta < 2500 ? '  <<< right after the prefetch' : '';
  console.log(`    ${String(Math.round(t.s)).padStart(6)}ms  ${String(Math.round(t.d)).padStart(5)}ms` +
    (delta != null ? `   (${delta >= 0 ? '+' : ''}${delta}ms)` : '') + mark);
}

ws.close();
browser.kill();
