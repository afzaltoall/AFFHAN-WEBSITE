import { spawn } from 'node:child_process';

// Which animations are still running once the page is idle, and are they
// composited?
//
//   node tools/audit/59-animation-inventory.mjs <url>
//
// 58-trace-breakdown showed 93 running animations, 415 Layerize passes and
// 14,218 UpdateLayer events over a 20s idle window. A composited animation
// costs the main thread nothing after it starts; one that is not composited
// costs style + layout + paint every frame. This lists each running animation
// by its CSS name and target so the two can be told apart.

const url = process.argv[2] ?? 'https://affhan.com/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9442);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-ai-${Date.now()}`, 'about:blank',
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
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
await send('Page.navigate', { url });
await sleep(16000);

// Properties a compositor can run on its own thread. Anything else in a
// keyframe forces the main thread to participate every frame.
const r = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const SAFE = new Set(['transform','opacity','translate','rotate','scale','filter','backdrop-filter','offset-distance','offset-path']);
    const props = new Map();
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of rules) {
        if (rule.type !== CSSRule.KEYFRAMES_RULE) continue;
        const set = new Set();
        for (const kf of rule.cssRules) for (const p of kf.style) set.add(p);
        props.set(rule.name, [...set]);
      }
    }
    const out = {};
    for (const a of document.getAnimations()) {
      const name = a.animationName || (a.effect && a.effect.getKeyframes && 'js') || '?';
      const el = a.effect && a.effect.target;
      const key = name;
      out[key] = out[key] || { n: 0, props: props.get(name) || [], sample: '', iter: a.effect?.getTiming?.().iterations };
      out[key].n++;
      if (!out[key].sample && el) out[key].sample = (el.tagName + '.' + String(el.className).split(' ').slice(0,3).join('.')).slice(0, 64);
    }
    const rows = Object.entries(out).map(([name, v]) => ({
      name, count: v.n, iterations: v.iter, sample: v.sample,
      offenders: v.props.filter(p => !SAFE.has(p)),
      props: v.props,
    }));
    return { rows, total: document.getAnimations().length };
  })()`,
});

const v = r.result?.result?.value;
console.log(`RUNNING ANIMATIONS ON ${url}: ${v.total}\n`);
console.log('NAME'.padEnd(22) + 'N'.padStart(4) + '  ITER'.padEnd(8) + ' MAIN-THREAD PROPS');
console.log('-'.repeat(92));
for (const row of v.rows.sort((a, b) => b.count - a.count)) {
  const iter = row.iterations === Infinity || row.iterations === null ? 'inf' : String(row.iterations ?? '?');
  console.log(
    row.name.slice(0, 21).padEnd(22) + String(row.count).padStart(4) + '  ' + iter.padEnd(6) +
    ' ' + (row.offenders.length ? '** ' + row.offenders.join(', ') : '(composited: ' + row.props.join(', ') + ')')
  );
  if (row.sample) console.log(' '.repeat(34) + 'e.g. ' + row.sample);
}

ws.close();
browser.kill();
