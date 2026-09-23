import { spawn } from 'node:child_process';

// Cumulative layout shift, and what moved.
//
//   node tools/audit/79-cls-probe.mjs <url> [seconds]
//
// Lighthouse started reporting CLS 0.333 on the trimmed build against 0 on the
// baseline, blaming the spotlight carousel's image. That could be a regression
// or it could be a shift that was always there and only now happens inside the
// measurement window, because the page reaches the carousel sooner. This
// measures the same PerformanceObserver entry on either build, and names the
// nodes, so the question is settled rather than argued.

const url = process.argv[2] ?? 'http://localhost:3000/';
const SECONDS = Number(process.argv[3] ?? 20);
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9458);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-cls-${Date.now()}`, 'about:blank',
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
await send('Network.setCacheDisabled', { cacheDisabled: true });

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__cls = 0;
    window.__shifts = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (e.hadRecentInput) continue;   // user-initiated shifts do not count
          window.__cls += e.value;
          const srcs = (e.sources || []).map(s => {
            const n = s.node;
            if (!n) return '(detached)';
            const cls = n.className ? '.' + String(n.className).split(' ').slice(0,2).join('.') : '';
            return (n.tagName || '?') + cls;
          });
          const r = (e.sources || []).map(x => ({
            from: x.previousRect ? [Math.round(x.previousRect.x), Math.round(x.previousRect.y), Math.round(x.previousRect.width), Math.round(x.previousRect.height)] : null,
            to: x.currentRect ? [Math.round(x.currentRect.x), Math.round(x.currentRect.y), Math.round(x.currentRect.width), Math.round(x.currentRect.height)] : null,
          }));
          window.__shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), srcs, rects: r });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  `,
});

await send('Page.navigate', { url });
await sleep(SECONDS * 1000);

const r = await send('Runtime.evaluate', { returnByValue: true, expression: `({ cls: window.__cls, shifts: window.__shifts })` });
const { cls = 0, shifts = [] } = r.result?.result?.value ?? {};
console.log(`${url}   CLS = ${cls.toFixed(4)}   (${shifts.length} shifts over ${SECONDS}s)`);
for (const s of shifts.sort((a, b) => b.v - a.v).slice(0, 6)) {
  console.log(`   ${String(s.v).padStart(8)} at ${String(s.t).padStart(6)}ms   ${s.srcs.join(', ').slice(0, 80)}`);
  for (const r of (s.rects || []).slice(0, 3)) {
    console.log(`            x,y,w,h  ${JSON.stringify(r.from)} -> ${JSON.stringify(r.to)}`);
  }
}

ws.close();
browser.kill();
