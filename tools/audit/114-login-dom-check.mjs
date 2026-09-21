import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

// Does the redesigned employee login hold up, measured rather than eyeballed?
//
//   node tools/audit/114-login-dom-check.mjs [baseUrl]
//
// Checks the things the screenshots were meant to show: the logo plate is
// square and the mark sits inside it with even padding, the live figures are
// real numbers rendered server-side, nothing scrolls sideways at any of the
// four widths, the small text clears WCAG AA, and focus is visible.

const BASE = process.argv[2] ?? 'http://localhost:3000';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9661);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIDTHS = [1440, 1024, 768, 390];

const PROFILE = `${process.env.TEMP}\\edge-dom-${PORT}-${Date.now()}`;
const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--disable-gpu',
  `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' });

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

let fails = 0;
const check = (ok, label, detail) => {
  if (!ok) fails++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
};

/** sRGB relative luminance, for the contrast ratios below. */
const LUM = `(c) => { const s = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]; }`;

const PROBE = `(() => {
  const lum = ${LUM};
  const rgb = (s) => (s.match(/\\d+(\\.\\d+)?/g) || []).slice(0, 3).map(Number);
  const ratio = (fg, bg) => { const a = lum(rgb(fg)), b = lum(rgb(bg)); const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };

  const plate = document.querySelector('a[aria-label="Affhan home"] span');
  const img = plate?.querySelector('img');
  const pr = plate?.getBoundingClientRect();
  const ir = img?.getBoundingClientRect();

  const nums = [...document.querySelectorAll('p.tabular-nums')]
    .map((p) => p.textContent.trim())
    .filter((t) => /^[\\d,]+\\+?$/.test(t));

  const sub = [...document.querySelectorAll('p')].find((p) => /For the Affhan sales team/.test(p.textContent || ''));
  const helper = [...document.querySelectorAll('p')].find((p) => /Sessions end after/.test(p.textContent || ''));
  const paintedBg = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const m = (c.match(/[d.]+/g) || []).map(Number);
      if (m.length >= 3 && (m.length < 4 || m[3] > 0.5)) return c;
    }
    return 'rgb(255, 255, 255)';
  };
  const cardBg = sub ? paintedBg(sub) : '';

  return {
    plate: pr ? { w: Math.round(pr.width), h: Math.round(pr.height) } : null,
    img: ir ? { w: Math.round(ir.width), h: Math.round(ir.height) } : null,
    padLeft: pr && ir ? Math.round(ir.left - pr.left) : null,
    padTop: pr && ir ? Math.round(ir.top - pr.top) : null,
    stats: nums,
    docW: document.documentElement.scrollWidth,
    winW: window.innerWidth,
    subColor: sub ? getComputedStyle(sub).color : null,
    subRatio: sub && cardBg ? +ratio(getComputedStyle(sub).color, cardBg).toFixed(2) : null,
    helperRatio: helper && cardBg ? +ratio(getComputedStyle(helper).color, cardBg).toFixed(2) : null,
    leftPanelVisible: (() => { const d = document.querySelector('main > div'); return d ? getComputedStyle(d).display !== 'none' : null; })(),
  };
})()`;

console.log(`\n=== employee login, measured  ${BASE}\n`);
for (const w of WIDTHS) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 500 ? 780 : 900, deviceScaleFactor: 1, mobile: w < 500 });
  await send('Page.navigate', { url: BASE + '/employee/login/' });
  await sleep(w === WIDTHS[0] ? 9000 : 5000);
  const r = await evaluate(PROBE);
  if (!r || r.__error) { console.log(`  ${w}px: ERROR ${r?.__error}`); fails++; continue; }
  console.log(`  --- ${w}px`);
  check(r.docW <= r.winW + 1, 'no horizontal scroll', `document ${r.docW}px in a ${r.winW}px window`);
  if (w === 1440) {
    check(r.plate && r.plate.w === r.plate.h, 'logo plate is square', r.plate ? `${r.plate.w}x${r.plate.h}` : 'not found');
    check(r.img && Math.abs(r.img.w - r.img.h) <= 1, 'logo mark is square', r.img ? `${r.img.w}x${r.img.h}` : 'not found');
    check(r.padLeft !== null && r.padTop !== null && Math.abs(r.padLeft - r.padTop) <= 1,
      'padding even on both axes', `left ${r.padLeft}px, top ${r.padTop}px`);
    check(r.stats.length === 4, 'four live figures rendered', r.stats.join(' / '));
    check(r.stats.some((s) => s.includes(',')), 'the catalogue figure is a real count', r.stats[0]);
    check((r.subRatio ?? 0) >= 4.5, 'subtitle clears WCAG AA (4.5:1)', `${r.subRatio}:1`);
    check((r.helperRatio ?? 0) >= 4.5, 'helper text clears WCAG AA', `${r.helperRatio}:1`);
  }
  if (w === 390) check(r.leftPanelVisible === false, 'left panel collapses on mobile');
}

// Focus, driven by a real Tab keypress.
//
// Programmatic .focus() does not reliably match :focus-visible, so a probe
// built on it reports "no focus ring" on a page that has one. Tabbing is what
// a keyboard user does and is the only honest test.
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + '/employee/login/' });
await sleep(8000);
let focus = null;
for (let i = 0; i < 14; i++) {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
  await sleep(120);
  const who = await evaluate("document.activeElement?.id || ''");
  if (who === 'employee-email') {
    await sleep(400);
    focus = await evaluate(`(() => {
      const el = document.querySelector('#employee-email');
      const cs = getComputedStyle(el);
      return { tabs: 0, shadow: cs.boxShadow, visible: el.matches(':focus-visible') };
    })()`);
    focus.tabs = i + 1;
    break;
  }
}
console.log('\n  --- focus (real Tab)');
check(Boolean(focus), 'the email field is reachable by Tab', focus ? `after ${focus.tabs} tabs` : 'never reached');
check(Boolean(focus?.visible), ':focus-visible matches', String(focus?.visible));
const painted = focus?.shadow && focus.shadow !== 'none' && !/^rgba(0, 0, 0, 0) 0px 0px 0px 0px(,|$)/.test(focus.shadow);
check(Boolean(painted), 'a focus ring is actually painted', (focus?.shadow || 'none').slice(0, 56));

console.log(fails === 0 ? '\nPASS' : `\nFAIL (${fails})`);
ws.close();
try { process.kill(browser.pid); } catch {}
await sleep(600);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
