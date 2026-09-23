import { spawn } from 'node:child_process';
import fs from 'node:fs';

// CLS measured while scrolling the page, not just on load.
//
//   node tools/eprolo/47-scroll-cls.mjs [url] [width]
//
// The earlier CLS checks in this repo loaded the page, waited, and read the
// number without ever scrolling — so they reported 0.0000 while DevTools showed
// 0.62 on a phone. Anything that defers rendering (lazy images,
// content-visibility with a contain-intrinsic-size estimate that is wrong)
// shifts layout at the moment the content scrolls into view, which is exactly
// what that method could not see.
//
// Scrolls in viewport-sized steps to the bottom, pausing for images, and
// reports the shifts with the elements responsible.

const URL_ARG = process.argv[2] ?? 'http://localhost:3000/';
const WIDTH = Number(process.argv[3] ?? 440);
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9720);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// How long to dwell after each scroll step. A real person does not wait a
// second for images before scrolling on, and shifts only appear while content
// is still arriving — so the pause is the whole experiment.
const PAUSE = Number(process.env.PAUSE ?? 900);
// How long to let the page settle before scrolling starts. The default waits
// for a quiet page, which hides every shift caused by content still arriving —
// a person who starts scrolling straight away sees all of them.
const SETTLE = Number(process.env.SETTLE ?? 7000);

const PROFILE = `${process.env.TEMP}\\edge-scls-${PORT}-${Date.now()}`;
const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--disable-gpu',
  '--disable-extensions', '--disable-component-extensions-with-background-pages',
  `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' });

async function firstPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === 'page');
      if (pages.length) return pages[0];
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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) =>
  new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__cls = { value: 0, n: 0, entries: [] };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;   // scrolling is not "recent input" for CLS
        window.__cls.value += e.value;
        window.__cls.n++;
        const srcs = (e.sources || []).map(s => {
          const n = s.node;
          if (!n || !n.tagName) return '(detached)';
          return (n.tagName + '.' + String(n.className || '').split(' ').slice(0, 3).join('.')).slice(0, 70);
        });
        window.__cls.entries.push({ v: +e.value.toFixed(4), y: Math.round(window.scrollY), srcs });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  `,
});

await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 956, deviceScaleFactor: 2, mobile: WIDTH < 900 });
await send('Page.navigate', { url: URL_ARG });
await sleep(SETTLE);

const afterLoad = await evaluate(`window.__cls.value`);

// Walk to the bottom in viewport steps, giving each step time to render and
// load its images — the same thing a person scrolling would do.
// behavior:"instant" matters: the page sets `scroll-smooth`, so a plain
// scrollBy animates and window.scrollY has not moved yet on the next line —
// which made an earlier version of this loop decide it had hit the bottom
// after one step and report a clean page.
let steps = 0;
let lastY = -1;
for (let i = 0; i < 120; i++) {
  await evaluate(`window.scrollTo({ top: window.scrollY + Math.round(window.innerHeight * 0.9), behavior: "instant" })`);
  await sleep(PAUSE);
  const y = await evaluate(`window.scrollY`);
  steps++;
  if (y === lastY) break;   // genuinely at the bottom
  lastY = y;
}

await sleep(2500);
const cls = await evaluate(`window.__cls`);
const height = await evaluate(`document.documentElement.scrollHeight`);

console.log(`\n=== ${URL_ARG}  @${WIDTH}px ===`);
console.log(`page height ${height}px, scrolled in ${steps} steps`);
console.log(`CLS on load (no scroll): ${afterLoad.toFixed(4)}`);
console.log(`CLS after scrolling    : ${cls.value.toFixed(4)}  (${cls.n} shifts)`);

const worst = [...cls.entries].sort((a, b) => b.v - a.v).slice(0, 10);
if (worst.length) {
  console.log(`\nworst shifts:`);
  for (const e of worst) console.log(`  ${String(e.v).padStart(8)} at scrollY ${String(e.y).padStart(6)}  <- ${e.srcs.join(' , ') || '(none)'}`);
}

// Which elements contribute the most in total.
const byEl = new Map();
for (const e of cls.entries) for (const s of e.srcs) byEl.set(s, (byEl.get(s) ?? 0) + e.v / e.srcs.length);
console.log(`\ntotal shift by element:`);
for (const [el, v] of [...byEl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  ${v.toFixed(4).padStart(8)}  ${el}`);
}

ws.close();
browser.kill();
await sleep(600);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
