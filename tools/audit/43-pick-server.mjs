// Serves the review/candidate pages on localhost and writes what you click
// straight to disk.
//
//   node tools/audit/43-pick-server.mjs              # port 4599
//   node tools/audit/43-pick-server.mjs --port 5000
//
//   http://localhost:4599/            -> candidate picker (candidates.html)
//   http://localhost:4599/review      -> thumbnail review  (thumb-review.html)
//
// This exists because the copy-and-paste step failed twice: the picks never
// reached the conversation, and applying anything without them would have meant
// inventing choices nobody made. Clicking "Save picks" now POSTs to /save and
// writes tools/audit/out/picks.txt in the exact format 42-apply-picks.mjs
// reads, so nothing has to survive a clipboard.
//
// Binds to 127.0.0.1 only. It writes into tools/audit/out and nowhere else.
import fs from 'fs';
import http from 'http';
import path from 'path';

const OUT = 'tools/audit/out';
const argv = process.argv.slice(2);
const portFlag = argv.indexOf('--port');
const PORT = portFlag >= 0 ? Number(argv[portFlag + 1]) : 4599;

const PAGES = {
  '/': path.join(OUT, 'candidates.html'),
  '/review': path.join(OUT, 'thumb-review.html'),
};

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'POST' && url.pathname === '/save') {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 2_000_000) req.destroy(); // nothing legitimate is this big
    });
    req.on('end', () => {
      try {
        const { picks } = JSON.parse(raw);
        if (!Array.isArray(picks) || !picks.length) throw new Error('no picks in payload');
        const lines = picks.map((p) => {
          if (!p || typeof p.id !== 'string' || typeof p.url !== 'string') throw new Error('malformed pick');
          return `${p.id} :: ${p.url}   # ${String(p.name ?? '').replace(/[\r\n]/g, ' ')}`;
        });
        fs.mkdirSync(OUT, { recursive: true });
        const file = path.join(OUT, 'picks.txt');
        fs.writeFileSync(file, lines.join('\n') + '\n');
        console.log(`\nsaved ${picks.length} picks -> ${file}`);
        for (const p of picks) console.log(`  ${p.name ?? p.id}`);
        send(res, 200, 'application/json', JSON.stringify({ ok: true, count: picks.length }));
      } catch (err) {
        console.error('save failed:', err.message);
        send(res, 400, 'application/json', JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  const file = PAGES[url.pathname];
  if (file && fs.existsSync(file)) {
    return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(file));
  }
  if (file) {
    return send(res, 404, 'text/plain; charset=utf-8',
      `${file} has not been generated yet.\n\nRun:\n  node tools/audit/41-candidate-page.mjs <categoryId>...\n  node tools/audit/40-thumb-review-page.mjs\n`);
  }
  send(res, 404, 'text/plain; charset=utf-8', 'not found\n\ntry /  or  /review\n');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`pick server on http://localhost:${PORT}`);
  console.log(`   /         candidate picker   (${fs.existsSync(PAGES['/']) ? 'ready' : 'NOT BUILT'})`);
  console.log(`   /review   thumbnail review   (${fs.existsSync(PAGES['/review']) ? 'ready' : 'NOT BUILT'})`);
  console.log(`\nclick your choices, press "Save picks", then tell Claude to apply them.`);
  console.log(`Ctrl+C to stop.`);
});
