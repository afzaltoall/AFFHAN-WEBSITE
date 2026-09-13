import { spawn } from 'node:child_process';

// What does one ranking card cost, and what would 593 of them cost?
//
//   node tools/audit/98-rankings-weight.mjs <origin> [port]
//
// "Remove pagination" on /rankings/ means rendering every eligible category at
// once, and there are 593 of them — 1,779 products and 1,779 images. Rather
// than estimate that, this measures the page at 15 cards, scrolls to load the
// next page, measures again, and takes the difference as the true per-card
// cost of DOM nodes, images and transferred bytes.
//
// The comparison that matters is the homepage: it was capped at 60 tiles
// because 662 cards / 688 images / 6,144 DOM nodes made GTmetrix unable to
// score the page at all.

const origin = (process.argv[2] ?? 'https://affhan.com').replace(/\/$/, '');
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.argv[3] ?? 9940);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-rw-${PORT}-${Date.now()}`, 'about:blank',
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
let bytes = 0;
const types = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Network.requestWillBeSent') types.set(m.params.requestId, m.params.type);
  if (m.method === 'Network.loadingFinished') bytes += m.params.encodedDataLength;
};
const send = (m, p = {}) => new Promise((res) => { const k = ++id; pending.set(k, res); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
const evalIn = async (x) => (await send('Runtime.evaluate', { returnByValue: true, expression: x })).result?.result?.value;

await send('Page.enable');
await send('Network.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Network.setCacheDisabled', { cacheDisabled: true });

const SNAP = `(() => ({
  cards: document.querySelectorAll('[class*="rank"], section h3').length,
  groups: document.querySelectorAll('h3').length,
  nodes: document.getElementsByTagName('*').length,
  images: document.images.length,
  html: document.documentElement.outerHTML.length,
}))()`;

await send('Page.navigate', { url: origin + '/rankings/' });
await sleep(14000);
const a = await evalIn(SNAP);
const bytesA = bytes;

// Scroll to the bottom repeatedly to pull in the next page of cards.
for (let i = 0; i < 4; i++) {
  await evalIn('window.scrollTo(0, document.body.scrollHeight)');
  await sleep(4000);
}
const b = await evalIn(SNAP);
const bytesB = bytes;

const dGroups = b.groups - a.groups;
console.log(`${origin}/rankings/   (1440x900, cache disabled)\n`);
console.log('  state'.padEnd(28) + 'groups'.padStart(8) + 'DOM nodes'.padStart(11) + 'images'.padStart(8) + 'HTML kB'.padStart(9) + 'transferred kB'.padStart(16));
console.log('  ' + '-'.repeat(80));
console.log('  first paint'.padEnd(28) + String(a.groups).padStart(8) + String(a.nodes).padStart(11) + String(a.images).padStart(8) +
  String(Math.round(a.html / 1024)).padStart(9) + String(Math.round(bytesA / 1024)).padStart(16));
console.log('  after scrolling'.padEnd(28) + String(b.groups).padStart(8) + String(b.nodes).padStart(11) + String(b.images).padStart(8) +
  String(Math.round(b.html / 1024)).padStart(9) + String(Math.round(bytesB / 1024)).padStart(16));

if (dGroups > 0) {
  const perNode = (b.nodes - a.nodes) / dGroups;
  const perImg = (b.images - a.images) / dGroups;
  const perHtml = (b.html - a.html) / dGroups;
  const perBytes = (bytesB - bytesA) / dGroups;
  console.log(`\n  measured cost of one card: ${perNode.toFixed(0)} DOM nodes, ${perImg.toFixed(1)} images, ` +
    `${(perHtml / 1024).toFixed(1)} kB HTML, ${(perBytes / 1024).toFixed(1)} kB transferred`);

  const TOTAL = 593;
  console.log(`\n  EXTRAPOLATED to all ${TOTAL} eligible cards, unpaginated:`);
  console.log(`    DOM nodes   ~${Math.round(a.nodes + perNode * (TOTAL - a.groups)).toLocaleString()}`);
  console.log(`    images      ~${Math.round(a.images + perImg * (TOTAL - a.groups)).toLocaleString()}`);
  console.log(`    HTML        ~${Math.round((a.html + perHtml * (TOTAL - a.groups)) / 1024).toLocaleString()} kB`);
  console.log(`    transferred ~${Math.round((bytesA + perBytes * (TOTAL - a.groups)) / 1024).toLocaleString()} kB`);
  console.log(`\n  for reference, the homepage cap exists because 662 cards meant`);
  console.log(`  688 images and 6,144 DOM nodes, and GTmetrix could not score it.`);
} else {
  console.log('\n  (no additional cards loaded on scroll — see the spinner bug)');
}

ws.close();
browser.kill();
