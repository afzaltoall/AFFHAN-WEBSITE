import { spawn } from 'node:child_process';

// How much layout / style / task work does the main thread do while the page
// just sits there?
//
//   node tools/audit/56-mainthread-work.mjs <url> <label>
//
// 54-cpu-idle-probe.mjs cannot answer this and never could: it counts long
// tasks (>50ms), while an animation that repaints every frame costs 1-5ms a
// frame and so never registers as one. It reported "longTasks: 0" both before
// and after a fix that removed 36 layout-animating elements, which is a
// measurement with no power to distinguish the two states.
//
// CDP's Performance.getMetrics exposes the counters that do move:
// LayoutCount and RecalcStyleCount tick once per affected frame, and
// TaskDuration accumulates main-thread time. Sampled twice over a fixed idle
// window, the deltas say plainly whether the page is quiet.

const url = process.argv[2] ?? 'http://localhost:3002/';
const label = process.argv[3] ?? url;
const WINDOW_MS = 10000;
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9901);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-mt-${Date.now()}`, 'about:blank',
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

await send('Page.enable');
await send('Performance.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(14000); // load and settle

const a = await metrics();
await sleep(WINDOW_MS);
const b = await metrics();

const d = (k) => Math.round((b[k] ?? 0) - (a[k] ?? 0));
const secs = WINDOW_MS / 1000;
console.log(`${label}`);
console.log(`  over ${secs}s of sitting still, no interaction:`);
console.log(`    LayoutCount        ${String(d('LayoutCount')).padStart(7)}   (${(d('LayoutCount') / secs).toFixed(1)}/s)`);
console.log(`    RecalcStyleCount   ${String(d('RecalcStyleCount')).padStart(7)}   (${(d('RecalcStyleCount') / secs).toFixed(1)}/s)`);
console.log(`    TaskDuration       ${(b.TaskDuration - a.TaskDuration).toFixed(3)}s of main-thread time`);
console.log(`    ScriptDuration     ${(b.ScriptDuration - a.ScriptDuration).toFixed(3)}s`);
console.log(`    LayoutDuration     ${(b.LayoutDuration - a.LayoutDuration).toFixed(3)}s`);
console.log(`    RecalcStyleDuration${(b.RecalcStyleDuration - a.RecalcStyleDuration).toFixed(3)}s`);

ws.close();
browser.kill();
