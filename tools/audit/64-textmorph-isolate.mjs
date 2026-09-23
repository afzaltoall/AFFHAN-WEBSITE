import { spawn } from 'node:child_process';

// Confirm TextMorph owns the idle cost, and test the gating options directly.
//
//   node tools/audit/64-textmorph-isolate.mjs <url>
//
// 63 killed every interval at once, which proves a timer is responsible but not
// which one, and not whether the cost is the timer or the framer-motion
// animation it starts. Each condition here leaves all other timers running.
//
// C and D are the two proposed gates measured as they would behave: scrolled
// out of view, and with the OS reduced-motion preference set.

const url = process.argv[2] ?? 'https://affhan.com/';
const SETTLE_MS = 10000;
const WINDOW_MS = 10000;
const ROUNDS = 2;
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9447);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-tm-${Date.now()}`, 'about:blank',
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
const metrics = async () => Object.fromEntries(((await send('Performance.getMetrics')).result?.metrics ?? []).map((m) => [m.name, m.value]));

// The morphing word is the only AnimatePresence on the page; its spans sit in
// the fixed-width box beside "Source".
const FIND = `document.querySelector('[class*="inline-flex"][class*="gap-"]')?.closest('div')`;

const CONDITIONS = [
  ['A baseline, at top of page', async () => {}],
  ['B TextMorph element removed', async () => {
    await send('Runtime.evaluate', { expression: `(${FIND})?.remove()` });
  }],
  ['C scrolled away (morph off-screen)', async () => {
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, document.body.scrollHeight)` });
  }],
  ['D prefers-reduced-motion: reduce', async () => {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  }],
  ['E tab hidden (backgrounded)', async () => {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: '' }] });
    await send('Runtime.evaluate', {
      expression: `Object.defineProperty(document,'visibilityState',{get:()=>'hidden',configurable:true});
                   Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});
                   document.dispatchEvent(new Event('visibilitychange'));`,
    });
  }],
];

await send('Page.enable');
await send('Performance.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });

const results = new Map(CONDITIONS.map(([k]) => [k, []]));
for (let r = 0; r < ROUNDS; r++) {
  for (const [label, apply] of CONDITIONS) {
    await send('Emulation.setEmulatedMedia', { features: [] });
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(400);
    await send('Page.navigate', { url });
    await sleep(SETTLE_MS);
    await apply();
    await sleep(600);
    const a = await metrics();
    await sleep(WINDOW_MS);
    const b = await metrics();
    results.get(label).push({
      task: +(b.TaskDuration - a.TaskDuration).toFixed(3),
      script: +(b.ScriptDuration - a.ScriptDuration).toFixed(3),
    });
  }
}

const baseBest = Math.min(...results.get(CONDITIONS[0][0]).map((x) => x.task));
console.log(`TEXTMORPH ISOLATION — ${url}   (4x CPU, ${WINDOW_MS / 1000}s idle window, ${ROUNDS} rounds)\n`);
console.log('  CONDITION'.padEnd(40) + 'idle main-thread s'.padStart(20) + 'best'.padStart(8) + 'vs base'.padStart(10) + 'script s'.padStart(10));
console.log('  ' + '-'.repeat(86));
for (const [label] of CONDITIONS) {
  const rs = results.get(label);
  const best = Math.min(...rs.map((x) => x.task));
  const d = Math.round(((best - baseBest) / baseBest) * 100);
  console.log('  ' + label.padEnd(38) + rs.map((x) => x.task.toFixed(3)).join(' / ').padStart(20) +
    best.toFixed(3).padStart(8) + (label === CONDITIONS[0][0] ? '—' : (d > 0 ? '+' : '') + d + '%').padStart(10) +
    Math.min(...rs.map((x) => x.script)).toFixed(3).padStart(10));
}

ws.close();
browser.kill();
