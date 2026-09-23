import { spawn } from 'node:child_process';

// Which feature owns the idle main-thread work? Measured by removing it.
//
//   node tools/audit/62-idle-attribution.mjs <url>
//
// 61-trace-phases showed the page still doing ~800ms of Layerize, ~690ms of
// style recalc and 93 rAF callbacks in a 16s window long after load. That says
// the work exists, not what causes it. This takes a baseline, then removes one
// suspect at a time from the live DOM and re-measures the same counters, so
// each line is a difference rather than a correlation.
//
// Counters come from Performance.getMetrics: LayoutCount and RecalcStyleCount
// tick per affected frame, TaskDuration accumulates main-thread time.

const url = process.argv[2] ?? 'https://affhan.com/';
const WINDOW_MS = 8000;
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9445);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-ia-${Date.now()}`, 'about:blank',
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

const metrics = async () => {
  const r = await send('Performance.getMetrics');
  return Object.fromEntries((r.result?.metrics ?? []).map((m) => [m.name, m.value]));
};
const evaluate = (expression) => send('Runtime.evaluate', { returnByValue: true, expression });

async function sample(label) {
  const a = await metrics();
  await sleep(WINDOW_MS);
  const b = await metrics();
  const secs = WINDOW_MS / 1000;
  const row = {
    label,
    layout: Math.round(b.LayoutCount - a.LayoutCount),
    style: Math.round(b.RecalcStyleCount - a.RecalcStyleCount),
    task: +(b.TaskDuration - a.TaskDuration).toFixed(3),
    script: +(b.ScriptDuration - a.ScriptDuration).toFixed(3),
  };
  row.fps = +(row.style / secs).toFixed(1);
  return row;
}

await send('Page.enable');
await send('Performance.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
await send('Page.navigate', { url });
await sleep(15000); // fully settled

const rows = [];
rows.push(await sample('baseline (everything running)'));

// 1. The 78 decorative beads in the brand/shipping bars.
const r1 = await evaluate(`document.querySelectorAll('[class*="b2b-bead"]').length`);
await evaluate(`document.querySelectorAll('[class*="b2b-bead"]').forEach(e => e.remove())`);
rows.push(await sample(`- ${r1.result?.result?.value} b2b-bead elements removed`));

// 2. The b2bFlow sweep on the badge.
await evaluate(`document.querySelectorAll('.b2b-badge').forEach(e => e.remove())`);
rows.push(await sample('- .b2b-badge removed too'));

// 3. The framer-motion morphing headline word (setInterval every 2.5s).
await evaluate(`
  for (const a of document.getAnimations()) { try { a.cancel(); } catch {} }
  const h = document.querySelector('[class*="inline-flex"][class*="gap-"]');
`);
await evaluate(`
  // Kill every remaining timer so the morph cannot re-fire.
  for (let i = 1; i < 100000; i++) { clearInterval(i); clearTimeout(i); }
`);
rows.push(await sample('- all timers + web animations cancelled'));

console.log(`IDLE ATTRIBUTION — ${url}   (4x CPU, ${WINDOW_MS / 1000}s per sample)\n`);
console.log('  SAMPLE'.padEnd(44) + 'style/s'.padStart(9) + 'layouts'.padStart(9) + 'task s'.padStart(9) + 'script s'.padStart(10));
console.log('  ' + '-'.repeat(78));
for (const r of rows) {
  console.log('  ' + r.label.padEnd(42) + String(r.fps).padStart(9) + String(r.layout).padStart(9) +
    String(r.task.toFixed(3)).padStart(9) + String(r.script.toFixed(3)).padStart(10));
}

ws.close();
browser.kill();
