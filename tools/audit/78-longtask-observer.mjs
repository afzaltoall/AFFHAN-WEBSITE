import { spawn } from 'node:child_process';

// Long tasks as Lighthouse sees them, with no tracing overhead.
//
//   node tools/audit/78-longtask-observer.mjs <url> [runs]
//
// The trace-based probes kept finding ~50-110ms tasks at a suspiciously exact
// 1s cadence late in the page, while the timer instrumentation said nothing
// fires after 10s. Recording a trace with disabled-by-default-devtools.timeline
// makes the renderer serialise and flush trace events on its own main thread,
// which is periodic and looks exactly like that — the measurement was creating
// the thing it measured.
//
// PerformanceObserver('longtask') is what Lighthouse's TTI uses, costs the page
// nothing, and reports the same >50ms threshold. The 5s-quiet-window search
// here is the TTI rule.

const url = process.argv[2] ?? 'http://localhost:3000/';
const RUNS = Number(process.argv[3] ?? 3);
const RUN_MS = 22000;
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9457);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-lto-${Date.now()}`, 'about:blank',
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
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: m, params: p })); });

await send('Page.enable');
await send('Network.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
await send('Network.emulateNetworkConditions', {
  offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
});
// Without this, runs after the first are served from memory cache: FCP comes
// back as 0 and no long tasks fire at all, which reads as a perfect score and
// measures nothing. Lighthouse loads cold every time; so does this.
await send('Network.setCacheDisabled', { cacheDisabled: true });

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__lt = [];
    window.__fcp = 0;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          window.__lt.push({ s: Math.round(e.startTime), d: Math.round(e.duration),
                             src: (e.attribution && e.attribution[0] && e.attribution[0].name) || '' });
        }
      }).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__fcp = Math.round(e.startTime);
      }).observe({ type: 'paint', buffered: true });
    } catch {}
  `,
});

const runs = [];
for (let r = 0; r < RUNS; r++) {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await send('Page.navigate', { url });
  await sleep(RUN_MS);
  const res = await send('Runtime.evaluate', { returnByValue: true, expression: `({ lt: window.__lt, fcp: window.__fcp })` });
  const { lt = [], fcp = 0 } = res.result?.result?.value ?? {};

  // TTI's rule: the first moment at or after FCP with 5s of no long task.
  let quiet = fcp;
  for (const t of lt.slice().sort((a, b) => a.s - b.s)) {
    if (t.s + t.d <= quiet) continue;
    if (t.s < quiet + 5000) quiet = t.s + t.d;
  }
  const found = quiet + 5000 <= RUN_MS;
  runs.push({ fcp, n: lt.length, total: lt.reduce((a, t) => a + t.d, 0), quiet, found, lt });
  console.log(`run ${r + 1}: FCP ${fcp}ms | ${lt.length} long tasks, ${Math.round(lt.reduce((a, t) => a + t.d, 0))}ms total | ` +
    (found ? `5s quiet window at ${Math.round(quiet)}ms` : `NO QUIET WINDOW in ${RUN_MS}ms`));
  const late = lt.filter((t) => t.s > 10000);
  console.log(`        after 10s: ${late.length} long tasks` + (late.length ? ' -> ' + late.map((t) => `${t.d}ms@${t.s}`).join(' ') : ''));
}

const ok = runs.filter((r) => r.found).length;
console.log(`\n  quiet window found in ${ok}/${RUNS} | median long tasks: ${runs.map(r=>r.n).sort((a,b)=>a-b)[Math.floor(RUNS/2)]}` +
  ` | median TTI-ish: ${runs.filter(r=>r.found).map(r=>Math.round(r.quiet)).sort((a,b)=>a-b)[Math.floor(ok/2)] ?? 'n/a'}ms`);

ws.close();
browser.kill();
