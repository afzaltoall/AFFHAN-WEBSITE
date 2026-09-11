// Builds a "pick one" page: for each category named on the command line, a row
// of candidate product images to choose its thumbnail from.
//
//   node tools/audit/41-candidate-page.mjs <categoryId> [categoryId...]
//   node tools/audit/41-candidate-page.mjs --file flagged.txt
//
// Clicking a candidate selects it (one per category). The page then prints
// lines ready to paste back, which 42-apply-picks.mjs turns into locked
// thumbnails.
//
// Candidates are chosen to be genuinely different from one another, because a
// picker offering twelve near-identical crops of the same product is no better
// than the automatic rule it exists to correct:
//
//   * only images no other category already claims, so picking one cannot
//     reintroduce the duplication the assignment script just removed;
//   * spread ACROSS the subtree — one image from each populated descendant in
//     turn, biggest first — rather than the first twelve rows of one leaf,
//     which in a 30,000-product category are usually twelve colourways of a
//     single item;
//   * moderation-blocked branches are never a source.
import fs from 'fs';
import sharp from 'sharp';
import { q, close } from './lib.mjs';
import { isCategoryBlocked } from './rules.mjs';

const PER_CATEGORY = 12;

const args = process.argv.slice(2);
let wanted = [];
const fileFlag = args.indexOf('--file');
if (fileFlag >= 0) {
  // Accepts the review page's own output: "Name  [category-id]" per line.
  const text = fs.readFileSync(args[fileFlag + 1], 'utf8');
  wanted = [...text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
  if (!wanted.length) wanted = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
} else {
  wanted = args.filter((a) => !a.startsWith('--'));
}
if (!wanted.length) {
  console.error('usage: 41-candidate-page.mjs <categoryId>...   |   --file flagged.txt');
  process.exit(1);
}

const cats = await q(`SELECT id,name,"parentId","thumbnailUrl","displayLabel" FROM "Category"`);
const byId = new Map(cats.map((c) => [c.id, c]));
const kids = new Map();
for (const c of cats) {
  if (!c.parentId || !byId.has(c.parentId)) continue;
  if (!kids.has(c.parentId)) kids.set(c.parentId, []);
  kids.get(c.parentId).push(c.id);
}
const counts = Object.fromEntries(
  (await q(`SELECT "categoryId" id, count(*)::int c FROM "Product" WHERE "categoryId" IS NOT NULL GROUP BY 1`)).map((r) => [r.id, r.c])
);
const deep = (id, s = new Set()) => {
  if (s.has(id)) return 0;
  s.add(id);
  return (counts[id] || 0) + (kids.get(id) ?? []).reduce((a, k) => a + deep(k, s), 0);
};
const blockedDeep = (id, s = new Set()) => {
  if (s.has(id)) return false;
  s.add(id);
  const c = byId.get(id);
  if (!c) return false;
  return isCategoryBlocked(c.name) || (c.parentId ? blockedDeep(c.parentId, s) : false);
};

const taken = new Set(cats.map((c) => c.thumbnailUrl).filter(Boolean));

/// Descendants holding products, biggest first, blocked branches dropped.
function populatedDescendants(rootId) {
  const out = [];
  const walk = (id, seen = new Set()) => {
    if (seen.has(id) || blockedDeep(id)) return;
    seen.add(id);
    if (counts[id]) out.push(id);
    const ks = [...(kids.get(id) ?? [])].sort((a, b) => deep(b) - deep(a));
    for (const k of ks) walk(k, seen);
  };
  walk(rootId);
  return out;
}

const sections = [];
for (const id of wanted) {
  const cat = byId.get(id);
  if (!cat) { console.error(`  !! no category ${id}`); continue; }

  const sources = populatedDescendants(id);
  // Round-robin across sources so the row shows the category's range.
  const perSource = await Promise.all(sources.slice(0, PER_CATEGORY * 2).map(async (sid) =>
    (await q(
      `SELECT "imageUrl" FROM "Product"
       WHERE "categoryId" = $1 AND "imageUrl" IS NOT NULL AND "imageUrl" <> ''
       ORDER BY id ASC LIMIT 6`, [sid]
    )).map((r) => ({ url: r.imageUrl, from: byId.get(sid)?.name ?? sid }))
  ));

  const picked = [];
  const used = new Set();
  for (let round = 0; round < 6 && picked.length < PER_CATEGORY; round++) {
    for (const list of perSource) {
      if (picked.length >= PER_CATEGORY) break;
      const c = list[round];
      if (!c || used.has(c.url) || taken.has(c.url)) continue;
      used.add(c.url);
      picked.push(c);
    }
  }
  sections.push({ id, name: cat.displayLabel || cat.name, current: cat.thumbnailUrl, candidates: picked, size: deep(id) });
  console.log(`${(cat.displayLabel || cat.name).padEnd(30)} ${picked.length} candidates from ${sources.length} descendants`);
}

async function inline(url, px) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(String(r.status));
    const buf = await sharp(Buffer.from(await r.arrayBuffer()))
      .resize(px, px, { fit: 'cover' }).jpeg({ quality: 76 }).toBuffer();
    return 'data:image/jpeg;base64,' + buf.toString('base64');
  } catch { return null; }
}

console.log('\ninlining images…');
await Promise.all(sections.flatMap((s) => [
  inline(s.current, 200).then((d) => { s.currentData = d; }),
  ...s.candidates.map((c) => inline(c.url, 220).then((d) => { c.data = d; })),
]));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const rows = sections.map((s) => `
<section class="cat">
  <header>
    <span class="ring cur">${s.currentData ? `<img src="${s.currentData}" alt="">` : '<span class="noimg">none</span>'}</span>
    <span class="meta">
      <span class="h">${esc(s.name)}</span>
      <span class="d">current image &middot; ${s.size.toLocaleString('en-US')} products</span>
    </span>
  </header>
  <div class="opts">
    ${s.candidates.map((c, i) => `
    <button class="opt" type="button" data-cat="${esc(s.id)}" data-url="${esc(c.url)}" data-name="${esc(s.name)}">
      <span class="ring">${c.data ? `<img src="${c.data}" alt="">` : '<span class="noimg">?</span>'}</span>
      <span class="src">${esc(c.from)}</span>
      <span class="tick">&#10003;</span>
    </button>`).join('')}
  </div>
</section>`).join('');

const html = `<title>Pick Category Images</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=IBM+Plex+Mono:wght@400&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
:root{--bg:#f4f7f8;--fg:#081f2a;--mut:#5b7280;--line:#dbe4e8;--card:#fff;--accent:#176579;--good:#1a7f5a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#071319;--fg:#e3edf1;--mut:#8298a4;--line:#172c36;--card:#0e1d25;--accent:#27a8c4;--good:#3fbf8f}}
:root[data-theme="dark"]{--bg:#071319;--fg:#e3edf1;--mut:#8298a4;--line:#172c36;--card:#0e1d25;--accent:#27a8c4;--good:#3fbf8f}
body{background:var(--bg);color:var(--fg);font:15px/1.55 "IBM Plex Sans","Segoe UI",system-ui,sans-serif;margin:0;padding:28px 24px 48px}
.wrap{max-width:1120px;margin:0 auto}
h1{font-family:"Archivo",system-ui,sans-serif;font-weight:800;font-size:23px;letter-spacing:-.015em;margin:0 0 5px}
p.lede{color:var(--mut);margin:0 0 18px;max-width:68ch}
.bar{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 0 13px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.count{font-weight:700}
button.act{font:inherit;font-weight:600;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:9px;padding:7px 13px;cursor:pointer}
button.act:hover{border-color:var(--accent)}
button.act:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cat{border-top:1px solid var(--line);padding:20px 0 6px}
.cat header{display:flex;align-items:center;gap:13px;margin-bottom:13px}
.meta{display:flex;flex-direction:column}
.h{font-family:"Archivo",system-ui,sans-serif;font-weight:600;font-size:16px}
.d{color:var(--mut);font-size:12px;font-variant-numeric:tabular-nums}
.opts{display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:14px 10px}
.ring{width:82px;height:82px;border-radius:50%;overflow:hidden;border:2px solid var(--line);background:var(--card);display:flex;align-items:center;justify-content:center;flex:none}
.ring.cur{width:60px;height:60px;border-color:var(--accent)}
.ring img{width:100%;height:100%;object-fit:cover;display:block}
.noimg{font-size:10px;color:var(--mut)}
.opt{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;padding:8px 3px;border-radius:11px;position:relative}
.opt:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.src{font-size:9.5px;color:var(--mut);line-height:1.2}
.tick{display:none;position:absolute;top:2px;right:8px;background:var(--good);color:#fff;font-size:11px;font-weight:800;border-radius:50%;width:19px;height:19px;line-height:19px;text-align:center}
.opt.sel .ring{border-color:var(--good);border-width:3px}
.opt.sel .tick{display:block}
#out{margin-top:26px;border-top:1px solid var(--line);padding-top:16px}
textarea{width:100%;min-height:150px;font:12px/1.6 "IBM Plex Mono",ui-monospace,monospace;background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:11px;box-sizing:border-box}
.status{font-size:12.5px;color:var(--mut)}
.status.ok{color:var(--good);font-weight:600}
.status.warn{color:#b45309;font-weight:600}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
<div class="wrap">
<h1>Pick category images</h1>
<p class="lede">The circle on the left of each row is what the category shows now. Click a replacement below it &mdash; one per category. Candidates are drawn from across the category's own subtree, and none is used by any other category.</p>
<div class="bar">
  <span class="count"><span id="n">0</span> of ${sections.length} chosen</span>
  <button class="act" id="save" type="button">Save picks</button>
  <button class="act" id="copy" type="button">Copy picks</button>
  <button class="act" id="clear" type="button">Clear all</button>
  <span id="status" class="status"></span>
</div>
${rows}
<div id="out">
  <h2 style="font-family:Archivo,system-ui,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--mut)">Picks &mdash; copy this back</h2>
  <textarea id="ta" readonly placeholder="Click a candidate under each category."></textarea>
</div>
</div>
<script>
var picks = new Map();
function sync(){
  document.getElementById('n').textContent = picks.size;
  var lines = [];
  picks.forEach(function(v, cat){ lines.push(cat + ' :: ' + v.url + '   # ' + v.name); });
  document.getElementById('ta').value = lines.join('\\n');
}
document.querySelectorAll('.opt').forEach(function(el){
  el.addEventListener('click', function(){
    var cat = el.getAttribute('data-cat');
    document.querySelectorAll('.opt[data-cat="' + cat.replace(/"/g,'\\\\"') + '"]').forEach(function(o){ o.classList.remove('sel'); });
    el.classList.add('sel');
    picks.set(cat, { url: el.getAttribute('data-url'), name: el.getAttribute('data-name') });
    sync();
  });
});
document.getElementById('clear').addEventListener('click', function(){
  picks.clear();
  document.querySelectorAll('.opt.sel').forEach(function(e){ e.classList.remove('sel'); });
  sync();
});
document.getElementById('copy').addEventListener('click', function(){
  var ta = document.getElementById('ta');
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(function(){});
});

// Save straight to disk when this page is being served by
// tools/audit/43-pick-server.mjs. Copy/paste is kept only as the fallback for
// opening the file directly — it is what failed twice, so it is no longer the
// path anyone is asked to rely on.
var st = document.getElementById('status');
function setStatus(msg, cls){ st.textContent = msg; st.className = 'status ' + (cls || ''); }
document.getElementById('save').addEventListener('click', function(){
  if (!picks.size) { setStatus('nothing picked yet', 'warn'); return; }
  if (location.protocol === 'file:') {
    setStatus('opened as a file — use Copy picks instead', 'warn');
    return;
  }
  var body = [];
  picks.forEach(function(v, cat){ body.push({ id: cat, url: v.url, name: v.name }); });
  setStatus('saving…');
  fetch('/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ picks: body })
  }).then(function(r){ return r.json(); })
    .then(function(j){
      if (j && j.ok) setStatus('saved ' + j.count + ' picks — tell Claude to apply them', 'ok');
      else setStatus('save failed: ' + ((j && j.error) || 'unknown'), 'warn');
    })
    .catch(function(e){ setStatus('save failed: ' + e.message, 'warn'); });
});
sync();
</script>`;

fs.mkdirSync('tools/audit/out', { recursive: true });
fs.writeFileSync('tools/audit/out/candidates.html', html);
console.log(`\nwrote tools/audit/out/candidates.html (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
await close();
