import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

// Is the synthetic gesture actually a wheel NOTCH stream, or a stream of many
// small deltas that only looks like one?
//
//   node tools/audit/99b-wheel-events.mjs <baseUrl> <path>
//
// 99-wheel-speed.mjs reported /careers/ at 1064 px per "notch" against 100 on
// every other page. Before believing a 10x figure, this counts the wheel
// events the page really receives during the same gesture and prints their
// deltas. Five events of 100 means the harness is faithful and the number is
// real; forty events of 13 means the harness is generating a stream no
// physical wheel produces, and the Lenis figure is an artefact of that.

const BASE = process.argv[2] ?? 'http://localhost:3101';
const PATH = process.argv[3] ?? '/careers/';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9613);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROFILE = `${process.env.TEMP}\\edge-wev-${PORT}-${Date.now()}`;
const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--enable-gpu-benchmarking', '--enable-threaded-compositing',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--window-size=1400,1000', `--user-data-dir=${PROFILE}`, 'about:blank',
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
await send('Page.navigate', { url: BASE + PATH });
await sleep(14000);

const out = await evaluate(`(async () => {
  const gb = chrome.gpuBenchmarking;
  const events = [];
  const onWheel = (e) => events.push({
    dy: e.deltaY, mode: e.deltaMode, trusted: e.isTrusted,
    defaultPrevented: e.defaultPrevented,
  });
  // capture:true so we see it even if something calls stopPropagation
  window.addEventListener('wheel', onWheel, { capture: true, passive: true });

  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 400));
  const before = window.scrollY;

  // Timed out rather than awaited forever: on /careers/ Lenis can leave the
  // synthetic gesture's completion callback unfired, which hung the first run
  // of this probe with no output at all.
  const atCallback = await Promise.race([
    new Promise((resolve) => {
      gb.smoothScrollBy(500, () => resolve(window.scrollY), 10, 10, gb.MOUSE_INPUT, 'down', 800, false);
    }),
    new Promise((resolve) => setTimeout(() => resolve(window.scrollY), 4000)),
  ]);

  await new Promise((r) => setTimeout(r, 1600));
  const after = window.scrollY;
  window.removeEventListener('wheel', onWheel, { capture: true });

  const sum = events.reduce((s, e) => s + e.dy, 0);
  return {
    count: events.length,
    sumDeltaY: sum,
    deltas: events.slice(0, 10).map((e) => e.dy),
    deltaModes: [...new Set(events.map((e) => e.mode))],
    anyPrevented: events.some((e) => e.defaultPrevented),
    allTrusted: events.every((e) => e.trusted),
    before, atCallback, after,
    lenis: Boolean(window.lenis),
    behavior: getComputedStyle(document.documentElement).scrollBehavior,
  };
})()`);

console.log(`\n${BASE}${PATH}`);
console.log(JSON.stringify(out, null, 2));

ws.close();
try { process.kill(browser.pid); } catch {}
await sleep(600);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
