import { spawn } from 'node:child_process';

// Why does the CPU never go idle?
//
//   node tools/audit/54-cpu-idle-probe.mjs [url]
//
// Lighthouse gives up with "No CPU idle period" when it cannot find a long
// enough quiet window on the main thread AFTER load. This measures the three
// things that prevent one, over a 12-second window once the page has settled:
//
//   1. long tasks   — main-thread blocks >50ms, via PerformanceObserver
//   2. frame churn  — how many rAF callbacks fire, i.e. is something animating
//                     continuously on the main thread rather than the compositor
//   3. network      — requests that keep arriving after load
//
// Reported as counts over a known window, so "the page never settles" becomes a
// number rather than an impression.

const url = process.argv[2] ?? 'https://affhan.com/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9851);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--disable-gpu',
  `--user-data-dir=${process.env.TEMP}/edge-cpu-${Date.now()}`, 'about:blank',
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
const events = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method) events.push(m);
};
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');

// Instrument before the document exists.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__long = [];
    window.__rafCount = 0;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__long.push(Math.round(e.duration));
      }).observe({ type: 'longtask', buffered: true });
    } catch (e) {}
    (function loop(){ window.__rafCount++; requestAnimationFrame(loop); })();
  `,
});

await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(12000); // let it load and settle

// Reset counters, then watch a clean 12s window with no interaction at all.
await send('Runtime.evaluate', { expression: 'window.__long = []; window.__rafCount = 0; window.__netMark = performance.now();' });
const before = events.length;
await sleep(12000);
const after = events.length;

const r = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const res = performance.getEntriesByType('resource').filter(e => e.startTime > (window.__netMark || 0));
    const anims = (document.getAnimations ? document.getAnimations() : []);
    const running = anims.filter(a => a.playState === 'running');
    const infinite = running.filter(a => {
      try { return (a.effect.getComputedTiming().iterations === Infinity); } catch (e) { return false; }
    });
    const byName = {};
    for (const a of infinite) {
      const n = a.animationName || (a.effect && a.effect.target && a.effect.target.className) || '?';
      const k = String(n).slice(0, 42);
      byName[k] = (byName[k] || 0) + 1;
    }
    return {
      longTasks: window.__long.length,
      longTaskTotalMs: window.__long.reduce((a, b) => a + b, 0),
      longestMs: window.__long.length ? Math.max(...window.__long) : 0,
      rafCallbacks: window.__rafCount,
      networkRequestsAfterSettle: res.length,
      runningAnimations: running.length,
      infiniteAnimations: infinite.length,
      topInfinite: Object.entries(byName).sort((a,b)=>b[1]-a[1]).slice(0, 8),
    };
  })()`,
});

console.log(`URL: ${url}`);
console.log(`CDP network events during the 12s idle window: ${after - before}`);
console.log(JSON.stringify(r.result?.result?.value, null, 1));

ws.close();
browser.kill();
