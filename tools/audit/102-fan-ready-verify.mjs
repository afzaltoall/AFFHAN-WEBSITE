import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

// Does .fan-ready restore exactly what was there, and cost nothing?
//
//   node tools/audit/102-fan-ready-verify.mjs <label> <baseUrl> [--reduced]
//
// Four things, at 1440px with the CPU throttled 4x:
//   CLS        cumulative layout shift over the first 12s.
//   STACKED    while the cards are coincident: how many carry a shadow.
//              Must be 1 on the fix and 20 on main.
//   READY      once .fan-ready is set: every card's computed box-shadow.
//              Must be identical on both, and identical to the CSS value.
//   REDUCED    with prefers-reduced-motion: reduce, .fan-ready must still
//              arrive, or the cards would be permanently shadowless.
//
// Read-only; its own browser and pid.

const LABEL = process.argv[2] ?? 'fix';
const BASE = process.argv[3] ?? 'http://localhost:3000';
const REDUCED = process.argv.includes('--reduced');
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9619);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EXPECTED = 'rgba(15, 23, 42, 0.4) 0px 24px 48px -14px';

const PROFILE = `${process.env.TEMP}\\edge-fr-${PORT}-${Date.now()}`;
const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--enable-gpu-benchmarking', '--enable-threaded-compositing',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--window-size=1500,1050', `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' });
console.log(`browser pid ${browser.pid} (own process)`);

async function firstPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const ps = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === 'page');
      if (ps.length) return ps[0];
    } catch {}
    await sleep(500);
  }
  throw new Error('no CDP page');
}
const target = await firstPage();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
const evaluate = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
if (REDUCED) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
}

// CLS has to start observing before anything paints.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__cls = 0;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}`,
});

await send('Page.navigate', { url: BASE + '/' });
for (let i = 0; i < 50; i++) {
  const ok = await evaluate(`(() => { const s = document.querySelector('#popular-products'); if (!s) return false; s.scrollIntoView({block:'center',behavior:'instant'}); return true; })()`);
  if (ok === true) break;
  await sleep(150);
}

const SHADOWS = `(() => {
  const layout = document.querySelector('.fan-layout');
  if (!layout) return { __none: true };
  const cards = [...layout.querySelectorAll('.fan-card')];
  const shadows = cards.map((c) => getComputedStyle(c).boxShadow);
  const withShadow = shadows.filter((s) => s && s !== 'none').length;
  const distinct = [...new Set(shadows)];
  const positioned = cards.filter((c) => getComputedStyle(c).transform !== 'none').length;
  return {
    n: cards.length,
    ready: layout.classList.contains('fan-ready'),
    withShadow,
    positioned,
    distinct,
  };
})()`;

console.log(`\nstate: ${LABEL}   base: ${BASE}   reduced-motion: ${REDUCED}\n`);

// While stacked.
await sleep(900);
const stacked = await evaluate(SHADOWS);
console.log(`  STACKED (0.9s)  cards ${stacked.n}  fan-ready ${stacked.ready}  positioned ${stacked.positioned}  with a shadow: ${stacked.withShadow}`);

// Wait for the class, then re-read.
let ready = null;
for (let i = 0; i < 60; i++) {
  const s = await evaluate(SHADOWS);
  if (s && s.ready) { ready = s; break; }
  await sleep(400);
}
if (!ready) {
  console.log('  READY           .fan-ready NEVER ARRIVED — cards would stay shadowless');
} else {
  console.log(`  READY           cards ${ready.n}  with a shadow: ${ready.withShadow}  distinct values: ${ready.distinct.length}`);
  console.log(`                  value: ${ready.distinct[0]}`);
  console.log(`                  matches the CSS exactly: ${ready.distinct.length === 1 && ready.distinct[0] === EXPECTED}`);
}

await sleep(3000);
const cls = await evaluate('window.__cls');
console.log(`  CLS (first ~12s) ${typeof cls === 'number' ? cls.toFixed(4) : cls}`);

ws.close();
try { process.kill(browser.pid); } catch {}
await sleep(700);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
