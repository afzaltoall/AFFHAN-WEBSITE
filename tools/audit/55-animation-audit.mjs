import { spawn } from 'node:child_process';

// Which infinite animations actually run on the page, and can the compositor
// take them?
//
//   node tools/audit/55-animation-audit.mjs [url]
//
// Read out of the live document via getAnimations(), not by parsing CSS. Two
// attempts at parsing the stylesheet produced a table that said "composited"
// for everything because the keyframe extractor had silently failed — the
// browser cannot get this wrong about its own animations.
//
// Only transform/opacity/filter can run off the main thread. Anything else in a
// keyframe (background-position, width, box-shadow, border-radius, ...) forces
// a style+paint on the main thread for every frame, forever, which is what
// stops Lighthouse ever finding a CPU idle window.

const url = process.argv[2] ?? 'https://affhan.com/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9861);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--disable-gpu',
  `--user-data-dir=${process.env.TEMP}/edge-anim-${Date.now()}`, 'about:blank',
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
await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(13000);

const r = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const COMPOSITABLE = new Set(['transform','opacity','filter','translate','rotate','scale','offset','composite','easing','computedOffset']);
    const out = {};
    for (const a of document.getAnimations()) {
      let iterations = 1;
      try { iterations = a.effect.getComputedTiming().iterations; } catch (e) {}
      if (iterations !== Infinity) continue;
      const name = a.animationName || '(unnamed)';
      let props = [];
      try { for (const kf of a.effect.getKeyframes()) props.push(...Object.keys(kf)); } catch (e) {}
      props = [...new Set(props)];
      const paints = props.filter(p => !COMPOSITABLE.has(p));
      const cls = (a.effect && a.effect.target && a.effect.target.className || '').toString().slice(0, 34);
      const key = name;
      out[key] = out[key] || { n: 0, props: props.join(','), paints: paints.join(','), sample: cls };
      out[key].n++;
    }
    return Object.entries(out).sort((x, y) => (y[1].paints ? 1 : 0) - (x[1].paints ? 1 : 0) || y[1].n - x[1].n);
  })()`,
});

const rows = r.result?.result?.value ?? [];
console.log(`URL: ${url}`);
console.log(`infinite animations running: ${rows.reduce((a, [, v]) => a + v.n, 0)} across ${rows.length} keyframe sets\n`);
console.log('ANIMATION'.padEnd(20) + 'COUNT  THREAD        NON-COMPOSITED PROPS');
console.log('-'.repeat(84));
for (const [name, v] of rows) {
  console.log(
    name.slice(0, 19).padEnd(20) +
    String(v.n).padStart(4) + '   ' +
    (v.paints ? 'MAIN (repaint)' : 'compositor    ').padEnd(15) +
    (v.paints || '-').slice(0, 40)
  );
}
ws.close();
browser.kill();
