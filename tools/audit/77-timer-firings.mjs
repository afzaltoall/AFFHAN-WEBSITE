import { spawn } from 'node:child_process';

// Every timer and rAF that FIRES late, with the code that scheduled it.
//
//   node tools/audit/77-timer-firings.mjs <url>
//
// 66 wrapped setInterval/setTimeout/rAF and reported "nothing scheduled after
// settle", which was true and useless: an interval registered once at 2s keeps
// firing forever without ever calling setInterval again. It measured the wrong
// event.
//
// This wraps the callback instead. The call site is captured when the timer is
// created, and every firing is attributed back to it along with how long the
// callback ran, so a recurring 1s task shows up as one row with 20 firings.

const url = process.argv[2] ?? 'http://localhost:3000/';
const IDLE_FROM_MS = 10000;
const RUN_MS = 30000;
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9456);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-tf-${Date.now()}`, 'about:blank',
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
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    (() => {
      const IDLE = ${IDLE_FROM_MS};
      const fires = new Map();  // site -> { n, lateN, ms, lateMs, kind, delays:Set }

      const site = () => {
        const lines = (new Error().stack || '').split('\n');
        for (const raw of lines.slice(2)) {
          const t = raw.trim();
          if (!t || t.includes('__sched') || t.includes('__fire')) continue;
          return t.replace(/^at\s+/, '').slice(0, 96);
        }
        return '(unknown)';
      };

      const wrap = (obj, name, kind) => {
        const orig = obj[name];
        obj[name] = function __sched(fn, delay, ...rest) {
          if (typeof fn !== 'function') return orig.apply(this, [fn, delay, ...rest]);
          const where = kind + ' ' + (delay != null ? delay + 'ms ' : '') + '<- ' + site();
          const rec = fires.get(where) || { n: 0, lateN: 0, ms: 0, lateMs: 0 };
          fires.set(where, rec);
          const wrapped = function __fire(...a) {
            const t = performance.now();
            const s = performance.now();
            try { return fn.apply(this, a); }
            finally {
              const d = performance.now() - s;
              rec.n++; rec.ms += d;
              if (t >= IDLE) { rec.lateN++; rec.lateMs += d; }
            }
          };
          return orig.call(this, wrapped, delay, ...rest);
        };
      };
      wrap(window, 'setInterval', 'setInterval');
      wrap(window, 'setTimeout', 'setTimeout');
      wrap(window, 'requestAnimationFrame', 'rAF');

      window.__fires = () => [...fires].map(([k, v]) => ({ k, ...v }))
        .filter(x => x.lateN > 0).sort((a, b) => b.lateMs - a.lateMs);
    })();
  `,
});

await send('Page.navigate', { url });
await sleep(RUN_MS);

const r = await send('Runtime.evaluate', { returnByValue: true, expression: `window.__fires ? window.__fires() : []` });
const rows = r.result?.result?.value ?? [];
const secs = (RUN_MS - IDLE_FROM_MS) / 1000;

console.log(`TIMER FIRINGS AFTER ${IDLE_FROM_MS / 1000}s — ${url}`);
console.log(`over ${secs}s, 4x CPU\n`);
if (!rows.length) console.log('  nothing fired late');
console.log('  late ms'.padStart(9) + 'fires'.padStart(7) + '  /s'.padStart(6) + '   SCHEDULED BY');
console.log('  ' + '-'.repeat(100));
for (const x of rows.slice(0, 14)) {
  console.log(String(Math.round(x.lateMs)).padStart(9) + String(x.lateN).padStart(7) +
    (x.lateN / secs).toFixed(1).padStart(6) + '   ' + x.k);
}

ws.close();
browser.kill();
