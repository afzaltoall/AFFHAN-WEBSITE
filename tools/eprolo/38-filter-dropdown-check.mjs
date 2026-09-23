import 'dotenv/config';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

// Does the admin Filter dropdown stay inside the window at every width?
//
//   node tools/eprolo/38-filter-dropdown-check.mjs [baseUrl]
//
// The panel was being clipped by the `overflow-hidden rounded-2xl` card it sat
// inside, and ran off the right edge on a narrow window. Both faults are
// invisible to a DOM assertion that only checks the panel exists, so this
// compares the panel's own bounding box against the viewport at several widths
// and writes a screenshot of each.

const BASE = process.argv[2] ?? 'http://localhost:3000';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9480);
const OUT = 'tools/eprolo/moderation/dropdown-shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Widths worth checking: phone, large phone, tablet, laptop, desktop.
const WIDTHS = (process.env.WIDTHS ?? '360,414,768,1024,1440').split(',').map(Number);
// Which admin list to open. FilterMenu is shared by Inquiries and Contact Us,
// so both call sites can be checked with the same script.
const NAV = process.env.NAV ?? 'Contact Us';

const SECRET = process.env.AUTH_SECRET || 'affhan_dev_secret';
const b64url = (i) => Buffer.from(i).toString('base64url');
const payload = b64url(JSON.stringify({
  id: 'probe-admin', email: process.env.ADMIN_EMAIL ?? 'admin@affhan.com',
  name: 'Probe', role: 'admin', iat: Date.now(),
}));
const token = `${payload}.${crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')}`;

fs.mkdirSync(OUT, { recursive: true });
const PROFILE = `${process.env.TEMP}\\edge-dd-${PORT}-${Date.now()}`;
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

await send('Network.enable');
await send('Page.enable');
await send('Runtime.enable');

const host = new URL(BASE).hostname;
// Re-set before every navigation: AdminAutoLogout fires a logout beacon on
// pagehide, so each Page.navigate clears the session we just installed and the
// next load lands on /admin/login/ instead.
const signIn = () => send('Network.setCookie', {
  name: 'affhan_session', value: token, domain: host, path: '/', httpOnly: true,
  // Production sets the session cookie Secure; a non-secure one of the same
  // name is ignored over https and the probe lands on the login screen.
  secure: BASE.startsWith('https'), sameSite: 'Lax',
});

let failures = 0;
for (const width of WIDTHS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height: Number(process.env.HEIGHT ?? 900), deviceScaleFactor: 1, mobile: width < 768,
  });
  await signIn();
  await send('Page.navigate', { url: `${BASE}/admin/` });
  await sleep(300);
  await signIn();
  await sleep(5000);

  // The minted cookie only verifies when AUTH_SECRET here matches the one the
  // server runs with — true locally, not against production. Fall back to the
  // real login form with the admin credentials from .env.
  const landedOnLogin = await evaluate(`location.pathname.includes('/admin/login')`);
  if (landedOnLogin) {
    const loggedIn = await evaluate(`(async () => {
      const email = document.querySelector('input[type="email"]');
      const pass = document.querySelector('input[type="password"]');
      if (!email || !pass) return 'no form';
      const set = (el, v) => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
        Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(email, ${JSON.stringify(process.env.ADMIN_EMAIL ?? '')});
      set(pass, ${JSON.stringify(process.env.ADMIN_PASSWORD ?? '')});
      await new Promise(r => setTimeout(r, 200));
      (email.closest('form') || document.querySelector('form')).requestSubmit();
      return 'submitted';
    })()`);
    await sleep(6000);
    const now = await evaluate(`location.pathname`);
    if (String(now).includes('/admin/login')) {
      console.log(`  ${String(width).padStart(5)}px  FAILED — could not sign in (${loggedIn}); still on ${now}`);
      failures++; continue;
    }
  }

  // Reach the Contact Us view, then open the Filter menu. Both are plain
  // buttons found by their text, so this does not depend on internal markup.
  const opened = await evaluate(`(async () => {
    const byText = (re) => [...document.querySelectorAll('button,a')].find(el => re.test((el.textContent||'').trim()));
    // Desktop renders a sidebar whose buttons carry title="Contact Us"; the
    // narrow layout hides that behind a menu button and labels it in a span.
    const navRe = new RegExp('^' + ${JSON.stringify(NAV)} + '$', 'i');
    const navSel = 'button[title=' + JSON.stringify(${JSON.stringify(NAV)}) + ']';
    let nav = document.querySelector(navSel) || byText(navRe);
    if (!nav) {
      const menu = [...document.querySelectorAll('button')].find(b => /menu/i.test(b.getAttribute('aria-label')||'') || b.querySelector('svg.lucide-menu'));
      if (menu) { menu.click(); await new Promise(r => setTimeout(r, 700)); }
      nav = document.querySelector(navSel) || byText(navRe);
    }
    if (!nav) return { ok: false, why: 'no ' + ${JSON.stringify(NAV)} + ' nav entry' };
    nav.click();
    await new Promise(r => setTimeout(r, 2200));
    const btn = [...document.querySelectorAll('button[aria-haspopup="menu"]')]
      .find(b => /Filter/i.test(b.textContent || ''));
    if (!btn) return { ok: false, why: 'no Filter button' };
    btn.click();
    await new Promise(r => setTimeout(r, 700));
    const panel = document.querySelector('[role="menu"]');
    if (!panel) return { ok: false, why: 'panel did not open' };
    const p = panel.getBoundingClientRect();
    const hasHandled = /Handled/i.test(panel.textContent || '');
    // Walk up from the button looking for an ancestor that would clip it.
    let clipper = null;
    for (let el = btn.parentElement; el && el !== document.body; el = el.parentElement) {
      const ov = getComputedStyle(el).overflow;
      if (ov !== 'visible') { clipper = el.className.slice(0, 60); break; }
    }
    return {
      ok: true, hasHandled, clipper,
      // Every radio row in the panel, so a section that should not be here
      // (Company outside Contact Us) shows up in the output.
      menuRows: [...panel.querySelectorAll('[role="menuitemradio"]')].map(b => (b.textContent||'').trim().replace(/\\s+/g,' ')),
      portalled: panel.parentElement === document.body,
      panel: { left: Math.round(p.left), right: Math.round(p.right), top: Math.round(p.top), bottom: Math.round(p.bottom), w: Math.round(p.width), h: Math.round(p.height) },
      vw: document.documentElement.clientWidth, vh: window.innerHeight,
      scrollW: document.documentElement.scrollWidth,
    };
  })()`);

  if (!opened?.ok) {
    console.log(`  ${String(width).padStart(5)}px  FAILED — ${opened?.why ?? 'no result'}`);
    const dbg = await evaluate(`JSON.stringify({ url: location.href, titled: [...document.querySelectorAll('button[title]')].map(b=>b.title).slice(0,15), btns: [...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim().replace(/\\s+/g,' ').slice(0,30)).filter(Boolean).slice(0,20) })`);
    console.log(`           ${dbg}`);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    if (s.result?.data) fs.writeFileSync(`${OUT}/FAIL-${width}.png`, Buffer.from(s.result.data, 'base64'));
    failures++; continue;
  }

  const p = opened.panel;
  const overflowRight = p.right > opened.vw;
  const overflowLeft = p.left < 0;
  const overflowBottom = p.bottom > opened.vh + 1;
  const pageScrollsX = opened.scrollW > opened.vw + 1;
  const bad = overflowRight || overflowLeft || overflowBottom || pageScrollsX;
  if (bad) failures++;

  console.log(`  ${String(width).padStart(5)}px  ${bad ? 'FAIL' : 'ok  '}  panel x:${p.left}-${p.right} (vw ${opened.vw})  y:${p.top}-${p.bottom} (vh ${opened.vh})  ${p.w}x${p.h}` +
    `${overflowRight ? '  RIGHT-OVERFLOW' : ''}${overflowLeft ? '  LEFT-OVERFLOW' : ''}${overflowBottom ? '  BOTTOM-OVERFLOW' : ''}${pageScrollsX ? '  PAGE-SCROLLS-X' : ''}`);
  console.log(`           rows: ${JSON.stringify(opened.menuRows)}`);
  console.log(`           portalled to body: ${opened.portalled}   nearest clipping ancestor of the button: ${opened.clipper ?? '(none)'}   "Handled" row present: ${opened.hasHandled}`);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result?.data) {
    const file = `${OUT}/filter-${width}.png`;
    fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    console.log(`           screenshot -> ${file}`);
  }
}

console.log(failures ? `\n${failures} width(s) FAILED` : '\nall widths clear');
ws.close();
browser.kill();
await sleep(600);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
process.exit(failures ? 1 : 0);
