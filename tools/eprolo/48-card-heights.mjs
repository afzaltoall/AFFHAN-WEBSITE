import { spawn } from 'node:child_process';
import fs from 'node:fs';

// The real rendered height of every .liquid-glass-card, per breakpoint.
//
//   node tools/eprolo/48-card-heights.mjs [width] [url]
//
// content-visibility needs contain-intrinsic-size to match what the element
// actually becomes. Guess low and the page grows as each card scrolls in;
// guess high and it shrinks. Either way the scrollbar jumps and layout shifts.
// This measures the two card shapes separately, because a category tile and a
// product card are not the same height.

const WIDTH = Number(process.argv[2] ?? 440);
const URL_ARG = process.argv[3] ?? 'http://localhost:3000/';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9760);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROFILE = `${process.env.TEMP}\\edge-h-${PORT}-${Date.now()}`;
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

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 956, deviceScaleFactor: 2, mobile: WIDTH < 900 });
await send('Page.navigate', { url: URL_ARG });
await sleep(9000);

const r = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    // Force every card to lay out for real. Without this the cards the renderer
    // has skipped report contain-intrinsic-size — the placeholder — so the
    // measurement would just hand back the guess it is supposed to check.
    const cardsAll = [...document.querySelectorAll('.liquid-glass-card')];
    for (const c of cardsAll) c.style.contentVisibility = 'visible';
    void document.body.offsetHeight;

    const stat = (els) => {
      // Only cards the renderer has actually laid out: a card still skipped by
      // content-visibility reports its placeholder size, not its real one.
      const h = els.map((e) => Math.round(e.getBoundingClientRect().height)).filter((x) => x > 40).sort((a, b) => a - b);
      if (!h.length) return null;
      return { n: h.length, min: h[0], p50: h[Math.floor(h.length * 0.5)], p90: h[Math.floor(h.length * 0.9)], max: h[h.length - 1] };
    };
    const cards = [...document.querySelectorAll('.liquid-glass-card')];
    const isCat = (c) => (c.getAttribute('href') || '').includes('categoryId=');
    return {
      width: innerWidth,
      categoryTiles: stat(cards.filter(isCat)),
      productCards: stat(cards.filter((c) => !isCat(c))),
    };
  })()`,
});

console.log(`${String(WIDTH).padStart(5)}px  ${JSON.stringify(r.result?.result?.value)}`);

ws.close();
browser.kill();
await sleep(600);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
