import 'dotenv/config';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

// What Team performance and a staff page actually print after the
// attribution change.
//
//   node tools/audit/96-team-page-shot.mjs [baseUrl]
//
// 95-attribution.mjs proves the SQL. This proves the screens: that the row
// which read "Passed on 1 · 100%" for a customer somebody else passed on now
// reads Not started, that the strip above it did not lose anything, and that
// the captions no longer claim "by its newest outcome".
//
// Read-only: navigates, reads and photographs. Clicks nothing.

const BASE = process.argv[2] ?? 'http://localhost:3000';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9499);
const OUT = 'tools/audit/rail-shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SECRET = process.env.AUTH_SECRET || 'affhan_dev_secret';
const b64url = (i) => Buffer.from(i).toString('base64url');
const payload = b64url(JSON.stringify({
  id: 'probe-admin', email: process.env.ADMIN_EMAIL ?? 'admin@affhan.com',
  name: 'Probe', role: 'admin', iat: Date.now(),
}));
const token = `${payload}.${crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')}`;

fs.mkdirSync(OUT, { recursive: true });
const PROFILE = `${process.env.TEMP}\\edge-team-${PORT}-${Date.now()}`;
const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--disable-gpu',
  '--disable-extensions', '--disable-component-extensions-with-background-pages',
  `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' });

async function firstPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json())
        .filter((t) => t.type === 'page');
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
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};

await send('Network.enable');
await send('Page.enable');
await send('Runtime.enable');
const host = new URL(BASE).hostname;
await send('Network.setCookie', {
  name: 'affhan_session', value: token, domain: host, path: '/', httpOnly: true,
  secure: BASE.startsWith('https'), sameSite: 'Lax',
});
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });

let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (detail) console.log(`        ${detail}`);
};

const TEAM_READ = `(() => {
  const h1 = document.querySelector('h1');
  const sub = (h1?.nextElementSibling?.textContent || '').trim();
  const figs = [...document.querySelectorAll('div.grid > div')]
    .map((d) => d.textContent.replace(/\\s+/g, ' ').trim()).filter((t) => t.length < 80);
  const heads = [...document.querySelectorAll('thead th')].map((t) => t.textContent.trim());
  const rows = [...document.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent.replace(/\\s+/g, ' ').trim()));
  return { sub, figs, heads, rows };
})()`;

await send('Page.navigate', { url: `${BASE}/admin/team-performance/` });
await sleep(6500);
const team = await evaluate(TEAM_READ);

console.log('=== /admin/team-performance/\n');
console.log(`  subtitle: ${team.sub}`);
for (const f of team.figs) console.log(`  strip:    ${f}`);
console.log(`  columns:  ${team.heads.join(' · ')}`);
for (const r of team.rows) if (r[1] !== '0') console.log(`  row:      ${r.join(' | ')}`);

check(!/newest outcome/.test(team.sub), 'the subtitle no longer says "by its newest outcome"', team.sub);
const busy = team.rows.find((r) => r[1] && r[1] !== '0');
if (busy) {
  // Columns are Staff, Assigned, bar, Lead, Passed on, Working, No lead, Untouched, Win rate.
  check(busy[4] === '0', 'the holder\'s "Passed on" column is 0, not 1', `Passed on = ${busy[4]}`);
  check(busy[7] === '1', 'and "Untouched" carries it instead', `Untouched = ${busy[7]}`);
  check(/—/.test(busy[8]), 'win rate reads as undecided rather than 100%', `win rate = ${busy[8]}`);
} else {
  // Not a failure: the live table holds one lead and it can be unassigned in
  // the console between runs, which happened once already. There is simply
  // nothing to inspect then.
  console.log('  --    nobody currently holds a lead, so the holder columns have nothing to show');
}

// The fenced group, which is the half a handover does not take away.
const group = ['Recorded', 'Passed on', 'Leads won', 'This week'];
check(team.heads.includes('Recorded by them') && team.heads.includes('The leads they hold now'),
  'both column groups are captioned above the table', team.heads.slice(0, 2).join(' / '));
check(group.every((g) => team.heads.includes(g)),
  'the four "Recorded by them" columns are present',
  team.heads.join(' · '));
const worker = team.rows.find((r) => r[r.length - 4] !== '0');
check(Boolean(worker),
  'recorded work is shown even for somebody with an empty book',
  worker
    ? `${worker[0].replace(/\s+/g, ' ').trim()} -> recorded ${worker[worker.length - 4]}, passed on ${worker[worker.length - 3]}`
    : 'no recorded work at all');
const shotA = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(`${OUT}/team-performance.png`, Buffer.from(shotA.result.data, 'base64'));

// The staff page for whoever holds the lead.
const href = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('tbody tr')];
  const busy = rows.find((tr) => (tr.querySelectorAll('td')[1]?.textContent || '').trim() !== '0');
  return busy?.querySelector('a')?.getAttribute('href') || null;
})()`);

if (href) {
  await send('Page.navigate', { url: BASE + href });
  await sleep(5000);
  const one = await evaluate(`(() => {
    const cap = [...document.querySelectorAll('span')]
      .map((s) => s.textContent.trim()).find((t) => /^each lead once/.test(t)) || '';
    const tiles = [...document.querySelectorAll('div.grid > div')]
      .map((d) => d.textContent.replace(/\\s+/g, ' ').trim()).filter((t) => t.length < 40);
    const stand = [...document.querySelectorAll('div')]
      .map((d) => d.textContent.replace(/\\s+/g, ' ').trim())
      .find((t) => /^Where their leads stand/.test(t)) || '';
    return { cap, tiles, stand: stand.slice(0, 220) };
  })()`);
  console.log(`\n=== ${href}\n`);
  console.log(`  caption: ${one.cap}`);
  console.log(`  stand:   ${one.stand}`);
  for (const t of one.tiles) console.log(`  tile:    ${t}`);
  check(!/newest outcome/.test(one.cap), 'the staff page caption is updated too', one.cap);
  // The tiles render the figure hard against its label — "1Not started" —
  // so the assertion reads them that way rather than as a sentence.
  const tiles = one.tiles.join(' | ');
  check(/\b1Not started\b/.test(tiles) && /\b0Not attended\b/.test(tiles),
    'the tile row shows the lead as Not started, and Not attended at zero',
    tiles);
  const shotB = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}/staff-page.png`, Buffer.from(shotB.result.data, 'base64'));
} else {
  console.log('  --    no staff row with an assigned lead to open');
}

console.log(`\nscreenshots: ${OUT}/team-performance.png, ${OUT}/staff-page.png`);
console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures})`);

ws.close();
browser.kill();
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
