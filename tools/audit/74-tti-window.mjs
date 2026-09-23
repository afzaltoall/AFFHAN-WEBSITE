import { spawn } from 'node:child_process';

// Does a 5-second quiet window exist, and which tasks stop it?
//
//   node tools/audit/74-tti-window.mjs <url> [runs]
//
// Lighthouse's TTI needs a 5s stretch after FCP containing no task longer than
// 50ms; when it never finds one it reports NO_TTI_CPU_IDLE_PERIOD, zeroes the
// score, and drops TBT — which is GTmetrix's "No CPU idle period" error.
//
// Running Lighthouse to answer that is unreliable here: three runs of the same
// build gave totalTaskTime of 21.0s, 41.5s and 41.5s and disagreed on pass or
// fail. This measures the criterion itself from a trace, and names the long
// tasks that push the window out, which is also what says where to look next.

const url = process.argv[2] ?? 'http://localhost:3000/';
const RUNS = Number(process.argv[3] ?? 3);
const RUN_MS = 25000;
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9453);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-tti-${Date.now()}`, 'about:blank',
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
let ev = [];
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
// Lighthouse's mobile profile, applied for real.
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
await send('Network.emulateNetworkConditions', {
  offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
});

const results = [];
for (let run = 0; run < RUNS; run++) {
  ev = [];
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(400);
  collecting = true;
  await send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
  await send('Page.navigate', { url });
  await sleep(RUN_MS);
  await send('Tracing.end');
  for (let i = 0; i < 60 && collecting; i++) await sleep(250);

  const nav = ev.find((e) => e.name === 'navigationStart');
  const t0 = nav ? nav.ts : ev.reduce((m, e) => (e.ts && e.ts < m ? e.ts : m), Infinity);
  const fcpEv = ev.find((e) => e.name === 'firstContentfulPaint');
  const fcp = fcpEv ? (fcpEv.ts - t0) / 1000 : 0;

  // Top-level tasks only: RunTask nests, and counting a parent alongside its
  // children would invent long tasks that never happened.
  const all = ev.filter((e) => e.name === 'RunTask' && e.ph === 'X' && e.dur > 0)
    .map((e) => ({ s: (e.ts - t0) / 1000, d: e.dur / 1000 }))
    .filter((t) => t.s >= 0).sort((a, b) => a.s - b.s);
  const top = [];
  let end = -1;
  for (const t of all) { if (t.s >= end) { top.push(t); end = t.s + t.d; } }

  const longs = top.filter((t) => t.d > 50 && t.s + t.d >= fcp);
  // Earliest point at or after FCP with 5s of no long task following it.
  let quietFrom = Math.max(fcp, 0);
  for (const l of longs) {
    if (l.s < quietFrom + 5000) quietFrom = l.s + l.d;
  }
  const found = quietFrom + 5000 <= RUN_MS;
  results.push({ fcp: Math.round(fcp), longs, quietFrom: Math.round(quietFrom), found });

  console.log(`run ${run + 1}: FCP ${Math.round(fcp)}ms | ${longs.length} long tasks after FCP | ` +
    (found ? `5s quiet window opens at ${Math.round(quietFrom)}ms` : `NO 5s QUIET WINDOW within ${RUN_MS}ms`));
  if (longs.length) {
    console.log('        longest: ' + longs.slice().sort((a, b) => b.d - a.d).slice(0, 6)
      .map((l) => `${Math.round(l.d)}ms@${Math.round(l.s)}`).join('  '));
  }
}

const ok = results.filter((r) => r.found).length;
const avgLong = (results.reduce((a, r) => a + r.longs.length, 0) / results.length).toFixed(1);
const avgQuiet = Math.round(results.filter((r) => r.found).reduce((a, r) => a + r.quietFrom, 0) / (ok || 1));
console.log(`\n  quiet window found in ${ok}/${RUNS} runs | avg long tasks after FCP: ${avgLong}` +
  (ok ? ` | avg TTI-ish: ${avgQuiet}ms` : ''));

ws.close();
browser.kill();
