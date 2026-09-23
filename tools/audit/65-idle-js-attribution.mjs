import { spawn } from 'node:child_process';

// Which functions run while the page is idle, by name and script.
//
//   node tools/audit/65-idle-js-attribution.mjs <url>
//
// 63 and 64 disagreed (-97% vs -41% for the same change) because a 10s window
// contains only four 2.5s morph ticks, so run-to-run variance swamps the
// effect. A/B sampling cannot resolve this at that period.
//
// Trace attribution can, and deterministically: devtools.timeline records the
// function name, script URL and line for every FunctionCall, TimerFire and
// FireAnimationFrame. Grouping those over a window that starts well after load
// says what the page is still executing, with no comparison run needed.

const url = process.argv[2] ?? 'https://affhan.com/';
const IDLE_FROM_MS = 12000;   // ignore everything before this: load and hydration
const CONDITION = process.argv[3] ?? "";
const RUN_MS = 32000;
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9448);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-ij-${Date.now()}`, 'about:blank',
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
await send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
await send('Page.navigate', { url });
await sleep(RUN_MS);
await send('Tracing.end');
for (let i = 0; i < 60 && collecting; i++) await sleep(250);

const nav = ev.find((e) => e.name === 'navigationStart');
const t0 = nav ? nav.ts : ev.reduce((m, e) => (e.ts && e.ts < m ? e.ts : m), Infinity);
const lo = t0 + IDLE_FROM_MS * 1000;

const idle = ev.filter((e) => e.ph === 'X' && typeof e.dur === 'number' && e.ts >= lo);
const secs = (RUN_MS - IDLE_FROM_MS) / 1000;

// Self time: an event's duration minus the duration of its nested children, so
// a parent FunctionCall is not credited with work done inside a child.
const byName = new Map();
for (const e of idle) {
  const d = e.args?.data ?? {};
  let key = null;
  if (e.name === 'FunctionCall') key = `${d.functionName || '(anonymous)'}  ${String(d.url || '').split('/').pop() || ''}:${d.lineNumber ?? ''}`;
  else if (e.name === 'TimerFire') key = `TimerFire  id=${d.timerId ?? '?'}`;
  else if (e.name === 'FireAnimationFrame') key = `rAF callback  id=${d.id ?? '?'}`;
  else continue;
  const v = byName.get(key) || { ms: 0, n: 0 };
  v.ms += e.dur / 1000; v.n++; byName.set(key, v);
}

console.log(`IDLE JS ATTRIBUTION — ${url}${CONDITION ? "   [condition applied]" : ""}`);
console.log(`window: ${IDLE_FROM_MS / 1000}s to ${RUN_MS / 1000}s after navigation (${secs}s), 4x CPU\n`);
console.log('  FUNCTION'.padEnd(56) + 'ms'.padStart(8) + 'calls'.padStart(8) + '/s'.padStart(7));
console.log('  ' + '-'.repeat(77));
for (const [k, v] of [...byName].sort((a, b) => b[1].ms - a[1].ms).slice(0, 14)) {
  console.log('  ' + k.slice(0, 54).padEnd(56) + String(Math.round(v.ms)).padStart(8) + String(v.n).padStart(8) + (v.n / secs).toFixed(1).padStart(7));
}

// Renderer work in the same window, for scale.
const rend = new Map();
for (const e of idle) {
  if (!['UpdateLayoutTree', 'Layout', 'Paint', 'Layerize', 'Commit', 'PrePaint', 'HitTest',
        'IntersectionObserverController::computeIntersections'].includes(e.name)) continue;
  const v = rend.get(e.name) || { ms: 0, n: 0 };
  v.ms += e.dur / 1000; v.n++; rend.set(e.name, v);
}
console.log('\n  RENDERER (same window)'.padEnd(58) + 'ms'.padStart(8) + 'count'.padStart(8));
console.log('  ' + '-'.repeat(77));
for (const [k, v] of [...rend].sort((a, b) => b[1].ms - a[1].ms)) {
  console.log('  ' + k.slice(0, 54).padEnd(56) + String(Math.round(v.ms)).padStart(8) + String(v.n).padStart(8));
}

ws.close();
browser.kill();
