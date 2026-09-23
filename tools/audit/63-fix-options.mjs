import { spawn } from 'node:child_process';

// What each candidate fix would actually buy, measured before writing any.
//
//   node tools/audit/63-fix-options.mjs <url>
//
// 62-idle-attribution removed suspects cumulatively in one page, so later rows
// inherited earlier removals and one sample visibly drifted. This gives every
// condition its own fresh load, runs two interleaved rounds, and reports both
// so noise is visible rather than averaged away.
//
// The conditions mirror the fixes under consideration. None of them touch the
// repo: each is a style or DOM change applied to the loaded page, so the
// numbers describe the effect without committing to it.

const url = process.argv[2] ?? 'https://affhan.com/';
const SETTLE_MS = 10000;
const WINDOW_MS = 10000;
const ROUNDS = 2;
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9446);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each condition is JS run once, after the page has loaded and settled.
const CONDITIONS = [
  ['A baseline (nothing changed)', ``],

  // will-change promotes a compositor layer whether or not the animation runs.
  // The droplet spans are paused and invisible until hover, so these layers
  // exist permanently for an effect that is not playing. Zero visual change.
  ['B drop will-change on paused beads', `
     const s = document.createElement('style');
     s.textContent = '.b2b-bead-lg,.b2b-bead-ripple,.b2b-bead-rebound{will-change:auto!important}';
     document.head.appendChild(s);`],

  // The 6 beads that animate unconditionally (no play-state:paused). These are
  // the only droplets visible at rest, so removing them IS a visual change.
  ['C stop the 6 always-on .b2b-bead', `
     document.querySelectorAll('.b2b-bead').forEach(e => e.style.animation = 'none');`],

  // The whole hover-only droplet field: 18 wrappers x 3 spans + 18 ::before.
  // Invisible until hover; on a touch device the hover rule never matches.
  ['D remove hover-only droplet field', `
     document.querySelectorAll('.water-droplets-area').forEach(e => e.remove());`],

  // The morphing headline word: setInterval every 2.5s driving per-character
  // framer-motion spans on the main thread.
  ['E stop TextMorph timer', `
     for (let i = 1; i < 60000; i++) clearInterval(i);`],

  // content-visibility:auto asks the renderer to keep re-deciding what is on
  // screen. Turning it off shows what that decision costs at rest.
  ['F content-visibility: visible', `
     const s = document.createElement('style');
     s.textContent = '#product-categories .liquid-glass-card,.hero-product-grid > *{content-visibility:visible!important}';
     document.head.appendChild(s);`],

  // The ceiling: everything stopped. Nothing below this is reachable.
  ['G floor: all timers + animations off', `
     for (let i = 1; i < 60000; i++) { clearInterval(i); clearTimeout(i); }
     for (const a of document.getAnimations()) { try { a.cancel(); } catch {} }`],
];

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-fo-${Date.now()}`, 'about:blank',
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

await send('Page.enable');
await send('Performance.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });

const results = new Map(CONDITIONS.map(([k]) => [k, []]));

for (let round = 0; round < ROUNDS; round++) {
  for (const [label, script] of CONDITIONS) {
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(400);
    await send('Page.navigate', { url });
    await sleep(SETTLE_MS);
    if (script.trim()) await send('Runtime.evaluate', { expression: `(() => {${script}})()` });
    await sleep(600); // let the change take effect before the window opens
    const a = await metrics();
    await sleep(WINDOW_MS);
    const b = await metrics();
    results.get(label).push({
      task: +(b.TaskDuration - a.TaskDuration).toFixed(3),
      script: +(b.ScriptDuration - a.ScriptDuration).toFixed(3),
      style: Math.round(b.RecalcStyleCount - a.RecalcStyleCount),
      layout: Math.round(b.LayoutCount - a.LayoutCount),
    });
  }
}

const base = results.get(CONDITIONS[0][0]);
const baseMin = Math.min(...base.map((r) => r.task));

console.log(`FIX OPTIONS — ${url}`);
console.log(`4x CPU, mobile viewport, fresh load each time, ${WINDOW_MS / 1000}s idle window, ${ROUNDS} rounds\n`);
console.log('  CONDITION'.padEnd(40) + 'idle main-thread s'.padStart(20) + 'best'.padStart(8) + 'vs base'.padStart(10) + 'style'.padStart(7));
console.log('  ' + '-'.repeat(83));
for (const [label] of CONDITIONS) {
  const rs = results.get(label);
  const best = Math.min(...rs.map((r) => r.task));
  const delta = baseMin > 0 ? Math.round(((best - baseMin) / baseMin) * 100) : 0;
  console.log(
    '  ' + label.padEnd(38) +
    rs.map((r) => r.task.toFixed(3)).join(' / ').padStart(20) +
    best.toFixed(3).padStart(8) +
    (label === CONDITIONS[0][0] ? '—' : (delta > 0 ? '+' : '') + delta + '%').padStart(10) +
    String(Math.min(...rs.map((r) => r.style))).padStart(7)
  );
}

ws.close();
browser.kill();
