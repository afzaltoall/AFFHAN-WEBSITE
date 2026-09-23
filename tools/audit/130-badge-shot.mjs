// The stats row, checked two ways:
//   1. geometry — does each caption share a left edge with its figure, and does
//      the sliding highlight land on a badge rather than in the gap between two?
//   2. a 4x crop to actually look at.
//
// The highlight is found by its own class (bg-brand/12), not by walking up a
// fixed number of parents — an earlier version of this script climbed to the
// wrong element the moment the badge markup changed and reported nonsense.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import sharp from 'sharp';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9694;
const PROFILE = `${process.env.TEMP}\\edge-tb-${Date.now()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const br = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions',
  `--user-data-dir=${PROFILE}`, '--window-size=1600,1000', 'about:blank',
], { stdio: 'ignore' });

let t;
for (let i = 0; i < 60; i++) {
  try {
    const ps = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
    if (ps.length) { t = ps[0]; break; }
  } catch {}
  await sleep(500);
}
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (m, q = {}) => new Promise((r) => { const n = ++id; pend.set(n, r); ws.send(JSON.stringify({ id: n, method: m, params: q })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: BASE });
await sleep(12000);

const PROBE = `(() => {
  const hl = document.querySelector('[class*="bg-brand/12"][class*="rounded-xl"]');
  if (!hl) return { err: 'no highlight box found' };
  const row = hl.parentElement;
  const R = (el) => { const r = el.getBoundingClientRect(); return {
    x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
    cx: +(r.left + r.width / 2).toFixed(1) }; };
  const cs = (el, ...p) => Object.fromEntries(p.map(k => [k, getComputedStyle(el)[k]]));
  const badges = [...row.children].filter(el => el !== hl && el.querySelector('svg'));
  const H = R(hl);
  return {
    row: R(row), highlight: H, gap: getComputedStyle(row).gap,
    badges: badges.map(b => {
      const spans = [...b.querySelectorAll('span')];
      const [valueTxt, label] = spans;
      const icon = b.querySelector('svg');
      const B = R(b);
      return {
        text: valueTxt.textContent.trim(),
        badge: B, valueTxt: R(valueTxt), icon: icon ? R(icon) : null, label: R(label),
        leftEdgeDelta: +(R(label).x - R(valueTxt).x).toFixed(1),
        lineGap: +(R(label).y - (R(valueTxt).y + R(valueTxt).h)).toFixed(1),
        // The box should sit 8px outside the badge on each side.
        hlPadLeft: +(B.x - H.x).toFixed(1),
        hlPadRight: +((H.x + H.w) - (B.x + B.w)).toFixed(1),
        style: {
          value: cs(valueTxt, 'fontSize', 'fontWeight', 'color'),
          label: cs(label, 'fontSize', 'fontWeight', 'color'),
        },
      };
    }),
  };
})()`;

const geo = await ev(PROBE);
if (geo.err) { console.log(geo.err); process.exit(1); }

console.log('FIGURE / CAPTION ALIGNMENT');
for (const b of geo.badges) {
  console.log(
    `  ${b.text.padEnd(16)} leftEdgeDelta ${String(b.leftEdgeDelta).padStart(6)}px` +
    `   lineGap ${String(b.lineGap).padStart(5)}px` +
    `   ${b.style.value.fontSize}/${b.style.value.fontWeight} over ${b.style.label.fontSize}/${b.style.label.fontWeight}`
  );
}
const aligned = geo.badges.every(b => Math.abs(b.leftEdgeDelta) < 0.5);
console.log(`  -> ${aligned ? 'ALIGNED (0px on all three)' : 'STILL OFF'}\n`);

// The box moves on a 1800ms cycle; watch it land on each badge in turn.
console.log('HIGHLIGHT BOX, across a full cycle (want 8 / 8 on the badge it is over)');
let allGood = true;
for (let i = 0; i < 7; i++) {
  const g = await ev(PROBE);
  const H = g.highlight;
  // Which badge is it actually over?
  const over = g.badges
    .map((b, n) => ({ n, b, d: Math.abs(b.badge.cx - H.cx) }))
    .sort((a, z) => a.d - z.d)[0];
  const ok = Math.abs(over.b.hlPadLeft - 8) < 1.5 && Math.abs(over.b.hlPadRight - 8) < 1.5;
  if (!ok) allGood = false;
  console.log(
    `  box x=${String(H.x).padStart(6)} w=${String(H.w).padStart(6)}` +
    `  over "${over.b.text}"  pad L=${String(over.b.hlPadLeft).padStart(5)} R=${String(over.b.hlPadRight).padStart(5)}` +
    `  ${ok ? 'fits' : '<-- MISFIT'}`
  );
  await sleep(950);
}
console.log(`  -> ${allGood ? 'BOX FITS EVERY BADGE' : 'BOX MISFITS'}\n`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(`${process.env.TEMP}/tb.png`, Buffer.from(shot.result.data, 'base64'));
const S = 2, PAD = 26;
const r = geo.row;
await sharp(`${process.env.TEMP}/tb.png`)
  .extract({
    left: Math.max(0, Math.round((r.x - PAD) * S)),
    top: Math.max(0, Math.round((r.y - PAD) * S)),
    width: Math.round((r.w + PAD * 2) * S),
    height: Math.round((r.h + PAD * 2) * S),
  })
  .resize(Math.round((r.w + PAD * 2) * S * 2))
  .toFile('tools/audit/badges.png');
console.log('wrote tools/audit/badges.png');

ws.close();
try { process.kill(br.pid); } catch {}
await sleep(600);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
