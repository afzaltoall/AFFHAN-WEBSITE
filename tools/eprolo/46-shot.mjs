import { spawn } from 'node:child_process';
import fs from 'node:fs';

// Screenshot a page at a given width, optionally scrolled down.
//
//   node tools/eprolo/46-shot.mjs <url> <name> [width] [scrollY]
//
// content-visibility skips rendering off-screen subtrees, so the thing to check
// visually is that content still appears correctly once scrolled to — a number
// in a probe cannot tell you a tile came back blank.

const [url, name, width = '1440', scrollY = '0'] = process.argv.slice(2);
if (!url || !name) { console.error('usage: 46-shot.mjs <url> <name> [width] [scrollY]'); process.exit(1); }

const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9700);
const OUT = 'tools/eprolo/moderation/shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const PROFILE = `${process.env.TEMP}\\edge-shot-${PORT}-${Date.now()}`;
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
await send('Emulation.setDeviceMetricsOverride', {
  width: Number(width), height: 900, deviceScaleFactor: 1, mobile: Number(width) < 768,
});
await send('Page.navigate', { url });
await sleep(9000);

if (Number(scrollY) > 0) {
  await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${Number(scrollY)})` });
  // Long enough for content-visibility to render what just came into view and
  // for its images to arrive.
  await sleep(6000);
}

const info = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const tiles = [...document.querySelectorAll('a[href*="categoryId="]')];
    const vis = tiles.filter(t => { const b = t.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; });
    const withImg = vis.filter(t => { const i = t.querySelector('img'); return i && i.complete && i.naturalWidth > 0; });
    return { scrollY: Math.round(window.scrollY), tiles: tiles.length, inView: vis.length, inViewWithLoadedImage: withImg.length };
  })()`,
});
console.log(`  ${name}: ${JSON.stringify(info.result?.result?.value)}`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
const file = `${OUT}/${name}.png`;
fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
console.log(`  -> ${file}`);

ws.close();
browser.kill();
await sleep(600);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
