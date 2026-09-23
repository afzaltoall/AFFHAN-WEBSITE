import { spawn } from 'node:child_process';

// Who schedules the work that keeps running? Captured at the call site.
//
//   node tools/audit/66-idle-scheduler-stacks.mjs <url>
//
// Every removal test so far has been wrong or inconclusive: beads (no effect),
// TextMorph (no effect). Guessing at suspects and removing them is the method
// that produced those, because the page's JS is minified and the trace only
// names the frame that ran, not the code that asked for it.
//
// This wraps setInterval / setTimeout / requestAnimationFrame before any page
// script runs and records the stack at each scheduling call, then reports only
// the call sites still firing after the page has settled. The answer is a line
// in a chunk rather than a hypothesis.

const url = process.argv[2] ?? 'https://affhan.com/';
const IDLE_FROM_MS = 12000;
const RUN_MS = 30000;
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9449);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-ss-${Date.now()}`, 'about:blank',
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
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    (() => {
      const T0 = performance.now();
      const hits = new Map();   // call site -> { n, afterIdle, kind, firstMs, lastMs }
      const IDLE = ${IDLE_FROM_MS};

      // The frame that called us: skip this wrapper and Error itself.
      const site = () => {
        const s = (new Error().stack || '').split('\n');
        for (const line of s.slice(2)) {
          const t = line.trim();
          if (!t || t.includes('__wrapSched')) continue;
          return t.replace(/^at\s+/, '').slice(0, 110);
        }
        return '(unknown)';
      };

      const record = (kind, where) => {
        const t = performance.now();
        const k = kind + ' <- ' + where;
        const v = hits.get(k) || { n: 0, afterIdle: 0, firstMs: Math.round(t), lastMs: 0 };
        v.n++; v.lastMs = Math.round(t);
        if (t >= IDLE) v.afterIdle++;
        hits.set(k, v);
      };

      const wrap = (obj, name, kind) => {
        const orig = obj[name];
        function __wrapSched(...args) { record(kind, site()); return orig.apply(this, args); }
        obj[name] = __wrapSched;
      };
      wrap(window, 'setInterval', 'setInterval');
      wrap(window, 'setTimeout', 'setTimeout');
      wrap(window, 'requestAnimationFrame', 'rAF');

      window.__sched = () => [...hits].map(([k, v]) => ({ k, ...v }))
        .filter(x => x.afterIdle > 0)
        .sort((a, b) => b.afterIdle - a.afterIdle);
    })();
  `,
});

await send('Page.navigate', { url });
await sleep(RUN_MS);

const r = await send('Runtime.evaluate', { returnByValue: true, expression: `window.__sched ? window.__sched() : []` });
const rows = r.result?.result?.value ?? [];
const secs = (RUN_MS - IDLE_FROM_MS) / 1000;

console.log(`IDLE SCHEDULER CALL SITES — ${url}`);
console.log(`calls made after ${IDLE_FROM_MS / 1000}s, over ${secs}s, 4x CPU\n`);
if (!rows.length) console.log('  nothing scheduled after settle');
console.log('  after-idle'.padStart(12) + '  /s'.padStart(7) + '   total   CALL SITE');
console.log('  ' + '-'.repeat(100));
for (const x of rows.slice(0, 18)) {
  console.log(String(x.afterIdle).padStart(12) + (x.afterIdle / secs).toFixed(1).padStart(7) + String(x.n).padStart(8) + '   ' + x.k);
}

ws.close();
browser.kill();
