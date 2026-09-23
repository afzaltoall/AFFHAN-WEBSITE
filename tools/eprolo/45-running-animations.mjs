import { spawn } from 'node:child_process';
import fs from 'node:fs';

// Which animations are still running after the page has settled, and do they
// force the main thread to repaint?
//
//   node tools/eprolo/45-running-animations.mjs [url]
//
// 72.8% of main-thread time on the homepage is V8's "(program)" bucket — style,
// layout, paint and image decode rather than JS. An infinite animation on a
// property the compositor cannot handle (anything but transform/opacity/filter)
// repaints every frame for as long as the page is open, which lands squarely in
// that bucket and never shows up as a slow function.

const URL_ARG = process.argv[2] ?? 'http://localhost:3000/';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9620);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROFILE = `${process.env.TEMP}\\edge-anim-${PORT}-${Date.now()}`;
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
await send('Page.navigate', { url: URL_ARG });
// Long enough that entrance animations have finished; whatever is still
// running here runs forever.
await sleep(14000);

const r = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    // Only transform, opacity and filter can be handed to the compositor.
    // Everything else repaints on the main thread every frame.
    const COMPOSITED = new Set(['transform', 'opacity', 'filter', 'backdrop-filter', 'rotate', 'scale', 'translate']);
    const out = [];
    for (const a of document.getAnimations()) {
      const eff = a.effect;
      if (!eff || a.playState !== 'running') continue;
      const timing = eff.getTiming();
      const infinite = timing.iterations === Infinity || timing.iterations > 100;
      let props = [];
      try { props = [...new Set(eff.getKeyframes().flatMap(k => Object.keys(k)))]
        .filter(p => !['offset','composite','easing','computedOffset'].includes(p)); } catch {}
      const cssProps = props.map(p => p.replace(/[A-Z]/g, c => '-' + c.toLowerCase()));
      const nonComposited = cssProps.filter(p => !COMPOSITED.has(p));
      const t = eff.target;
      out.push({
        name: a.animationName || '(js)',
        infinite,
        props: cssProps,
        nonComposited,
        dur: Math.round(timing.duration || 0),
        target: t ? (t.tagName + '.' + String(t.className || '').split(' ').slice(0,2).join('.')).slice(0, 54) : '?',
        count: 1,
      });
    }
    return out;
  })()`,
});

const list = r.result?.result?.value ?? [];

// Collapse identical animations (a marquee applied to 40 tiles is one problem).
const grouped = new Map();
for (const a of list) {
  const key = `${a.name}|${a.props.join(',')}|${a.infinite}`;
  const g = grouped.get(key) ?? { ...a, count: 0, targets: new Set() };
  g.count++; g.targets.add(a.target);
  grouped.set(key, g);
}

console.log(`\n=== ${URL_ARG} ===`);
console.log(`${list.length} animations still running 14s after navigation\n`);

const rows = [...grouped.values()].sort((a, b) => b.count - a.count);
const bad = rows.filter((r) => r.infinite && r.nonComposited.length);

for (const g of rows) {
  const flag = g.infinite && g.nonComposited.length ? 'REPAINTS ' : g.infinite ? 'composited' : 'finite    ';
  console.log(`  ${flag} x${String(g.count).padStart(3)}  ${g.name.padEnd(26)} [${g.props.join(', ')}]`);
  if (g.infinite && g.nonComposited.length) {
    console.log(`             non-composited: ${g.nonComposited.join(', ')}   e.g. ${[...g.targets][0]}`);
  }
}

console.log(`\ninfinite + non-composited (repaint every frame, forever): ${bad.reduce((s, g) => s + g.count, 0)} element(s) across ${bad.length} animation(s)`);

ws.close();
browser.kill();
await sleep(600);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
