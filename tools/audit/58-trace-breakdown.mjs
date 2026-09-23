import { spawn } from 'node:child_process';

// What is the main thread actually DOING?
//
//   node tools/audit/58-trace-breakdown.mjs <url>
//
// Lighthouse attributes 4.8s of the homepage's 8.7s to "Other", which is not a
// category so much as everything it could not name. This records a real trace
// and aggregates the devtools.timeline events by name, so "Other" resolves into
// ImageDecodeTask, UpdateLayerTree, Paint, ParseHTML and the rest.
//
// Also counts compositor layers: every element with will-change or a running
// transform animation can get its own, and this page runs 84 infinite
// animations.

const url = process.argv[2] ?? 'https://affhan.com/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9441);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-tr-${Date.now()}`, 'about:blank',
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
const traceEvents = [];
let collecting = false;
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Tracing.dataCollected') traceEvents.push(...m.params.value);
  if (m.method === 'Tracing.tracingComplete') collecting = false;
};
const send = (mm, p = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: mm, params: p })); });

await send('Page.enable');
await send('Runtime.enable');
// Lighthouse's own emulation: mid-tier phone, 4x CPU.
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });

collecting = true;
await send('Tracing.start', {
  categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing',
  transferMode: 'ReportEvents',
});
await send('Page.navigate', { url });
await sleep(20000);
await send('Tracing.end');
for (let i = 0; i < 40 && collecting; i++) await sleep(250);

const by = new Map();
for (const e of traceEvents) {
  if (e.ph !== 'X' || typeof e.dur !== 'number') continue;
  const k = e.name;
  const v = by.get(k) || { ms: 0, n: 0 };
  v.ms += e.dur / 1000;
  v.n++;
  by.set(k, v);
}
const rows = [...by.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 16);
console.log(`TRACE: ${url}   (${traceEvents.length} events, 4x CPU, mobile)\n`);
console.log('EVENT'.padEnd(34) + 'TOTAL ms'.padStart(10) + 'COUNT'.padStart(9));
console.log('-'.repeat(54));
for (const [k, v] of rows) console.log(k.slice(0, 33).padEnd(34) + String(Math.round(v.ms)).padStart(10) + String(v.n).padStart(9));

const layers = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const wc = [...document.querySelectorAll('*')].filter(e => {
      const s = getComputedStyle(e);
      return s.willChange && s.willChange !== 'auto';
    }).length;
    return { elements: document.getElementsByTagName('*').length, willChange: wc, images: document.images.length,
             animations: document.getAnimations().length };
  })()`,
});
console.log('\nDOM: ' + JSON.stringify(layers.result?.result?.value));

ws.close();
browser.kill();
