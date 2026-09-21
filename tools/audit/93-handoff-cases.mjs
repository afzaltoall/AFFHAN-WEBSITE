import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Does "and then what?" read correctly for every ending the rotation has?
//
//   node tools/audit/93-handoff-cases.mjs
//
// Live data only ever contains one of these at a time — right now a single
// ROTATED — so the matcher is exercised against made-up event rows instead.
// The point is the three endings the office will actually hit (handed on,
// parked with nobody to hand to, given up on) plus the four ways the join can
// be asked a question the record does not answer.
//
// handoffOf is pure, so this compiles that one file and calls it. No database,
// no browser, nothing to clean up but a temp directory.

const SRC = 'src/lib/lead-handoff.ts';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-'));
const out = path.join(dir, 'lead-handoff.mjs');

// Everything that touches a database goes: the prisma import and the one
// function that uses it. What is left — the types, DECISIVE and handoffOf —
// compiles and runs on its own, which is the whole reason the matcher was
// pulled out of the query in the first place.
//
// Normalised to LF first: the working copy is CRLF (core.autocrlf=true) and
// these markers are not.
const full = fs.readFileSync(SRC, 'utf8').split('\r\n').join('\n');
const from = full.indexOf('/**\n * The consequence of each decline');
const to = full.indexOf('/**\n * The matching itself');
if (from < 0 || to < 0) {
  console.error('lead-handoff.ts no longer has the shape this harness cuts: check the markers.');
  process.exit(1);
}
const ts = (full.slice(0, from) + full.slice(to)).replace(/^import \{ prisma \}.*$/m, '');
const tsFile = path.join(dir, 'lead-handoff.ts');
fs.writeFileSync(tsFile, ts);
execFileSync('npx', ['tsc', tsFile, '--target', 'es2022', '--module', 'esnext',
  '--moduleResolution', 'bundler', '--outDir', dir, '--skipLibCheck'],
  { stdio: 'inherit', shell: true });
fs.renameSync(path.join(dir, 'lead-handoff.js'), out);
const { handoffOf } = await import('file://' + out.split('\\').join('/'));

const KHAJA = 'emp-khaja';
const T = new Date('2026-09-21T03:54:49.424Z');
const after = (ms) => new Date(T.getTime() + ms);
const ev = (kind, extra = {}) => ({
  kind, toName: null, toEmployeeId: null, fromEmployeeId: KHAJA, note: null,
  createdAt: after(142), ...extra,
});
const decline = { employeeId: KHAJA, at: T };

// Each case is what the feed would print, so the assertion is the sentence an
// administrator reads rather than the shape underneath it.
const render = (h) =>
  h === null ? '(nothing after the chip)'
  : h.kind === 'passed' ? `→ passed to ${h.toName}`
  : h.kind === 'waiting' ? `→ waiting in the queue${h.note ?? h.reason ? ' · ' + (h.reason ?? '') : ''}`
  : '→ nobody on the team took it on';

const CASES = [
  {
    name: 'handed to the next person (first time round: ENTERED)',
    events: [ev('ENTERED', { toName: 'MOHAMMED SAFIQ', toEmployeeId: 'emp-safiq' })],
    want: '→ passed to MOHAMMED SAFIQ',
  },
  {
    name: 'handed on again later in the cycle (ROTATED)',
    events: [ev('ROTATED', { toName: 'SAMSUTHEEN', toEmployeeId: 'emp-sams' })],
    want: '→ passed to SAMSUTHEEN',
  },
  {
    name: 'pool of one — nobody else to hand it to (PARKED)',
    events: [ev('PARKED', { note: 'nobody else active to hand it to' })],
    want: '→ waiting in the queue · nobody else active to hand it to',
  },
  {
    name: 'nobody active at all (PARKED)',
    events: [ev('PARKED', { note: 'no active employees' })],
    want: '→ waiting in the queue · no active employees',
  },
  {
    name: 'offered to the whole team twice and taken by nobody (INVALIDATED)',
    events: [ev('INVALIDATED', { note: 'no outcome after 2 passes through the team' })],
    want: '→ nobody on the team took it on',
  },
  {
    name: 'the queue follow-up never ran — no event at all',
    events: [],
    want: '(nothing after the chip)',
  },
  {
    name: 'a WEEK-LATER expiry sweep must not attach (INVALIDATED, no from)',
    events: [{ ...ev('INVALIDATED', { note: 'a week in the queue with no outcome' }), fromEmployeeId: null, createdAt: after(7 * 24 * 3600 * 1000) }],
    want: '(nothing after the chip)',
  },
  {
    name: 'somebody ELSE handing the same customer on must not attach',
    events: [{ ...ev('ROTATED', { toName: 'KARAN', toEmployeeId: 'emp-karan' }), fromEmployeeId: 'emp-someone-else' }],
    want: '(nothing after the chip)',
  },
  {
    name: 'an earlier handover of the same customer must not attach',
    events: [{ ...ev('ROTATED', { toName: 'LIJITH', toEmployeeId: 'emp-lijith' }), createdAt: after(-60_000) }],
    want: '(nothing after the chip)',
  },
  {
    name: 'bookkeeping before the decision is skipped (PASS_COMPLETE, then ROTATED)',
    events: [
      { ...ev('PASS_COMPLETE', { note: 'offered to the whole team (7) 1x' }), createdAt: after(100) },
      ev('ROTATED', { toName: 'RIYAZ KHAN', toEmployeeId: 'emp-riyaz' }),
    ],
    want: '→ passed to RIYAZ KHAN',
  },
  {
    name: 'the decline that came back round: the FIRST matching event wins',
    events: [
      ev('ROTATED', { toName: 'AHAMED MAHADHI', toEmployeeId: 'emp-ahamed' }),
      { ...ev('ROTATED', { toName: 'KARAN', toEmployeeId: 'emp-karan' }), createdAt: after(3 * 3600 * 1000) },
    ],
    want: '→ passed to AHAMED MAHADHI',
  },
];

let failed = 0;
console.log('=== what the Activity line reads, per ending\n');
for (const c of CASES) {
  const got = render(handoffOf(c.events, decline));
  const ok = got === c.want;
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${c.name}`);
  console.log(`        ${got}`);
  if (!ok) console.log(`        expected: ${c.want}`);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${CASES.length - failed}/${CASES.length} ${failed === 0 ? 'PASS' : 'FAIL'}`);
process.exit(failed === 0 ? 0 : 1);
