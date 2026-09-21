import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// What does /admin/team-performance/ actually SHOW, cell by cell, for the two
// scenarios where a lead changes hands?
//
//   node tools/audit/97-attribution-report.mjs
//
// 95-attribution.mjs asserts the fix is right. This one reports it: every
// column of both rows, the win rate, and the four figures in the strip, for
//
//   1. A records Not attended, the rotation hands the lead to B
//   2. A records Lead, an admin reassigns to B
//
// Same method as 95: the production SQL lifted out of lib/lead-performance.ts
// so it cannot drift, run over TEMP TABLES that shadow the real ones
// (pg_temp precedes public on the search path) with ON COMMIT DROP, so not a
// row is written anywhere.
//
// The two bits of arithmetic the page does after the SQL — winRateOf and the
// strip's `open` — are restated here and checked against the module's source
// below, so a change to either is a failure here rather than a silent lie.

const root = 'C:/Users/ROG/Downloads/AFFHAN-WEBSITE-main';
const require = createRequire(path.join(root, 'package.json'));
for (const f of ['.env.local', '.env']) {
  try {
    const t = fs.readFileSync(path.join(root, f), 'utf8');
    const m = t.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
    if (m && !process.env.DATABASE_URL) process.env.DATABASE_URL = m[1];
  } catch {}
}
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SRC = fs.readFileSync(path.join(root, 'src/lib/lead-performance.ts'), 'utf8')
  .split('\r\n').join('\n');

function literalAfter(marker) {
  const at = SRC.indexOf(marker);
  if (at < 0) throw new Error(`lead-performance.ts no longer contains: ${marker}`);
  return SRC.slice(SRC.lastIndexOf('`', at) + 1, SRC.indexOf('`', at));
}
const ASSIGNED_LEADS = literalAfter('leads AS (\n    SELECT id, "assignedToId"');
const PER_PERSON = literalAfter('WITH mine AS (').replace('${ASSIGNED_LEADS}', ASSIGNED_LEADS);
const TEAM = literalAfter('WITH latest AS (').replace('${ASSIGNED_LEADS}', ASSIGNED_LEADS);

// The page's own arithmetic, restated — and pinned to the source so it cannot
// quietly diverge from what the screen does.
const winRateOf = (lead, noLead) => (lead + noLead === 0 ? null : Math.round((lead / (lead + noLead)) * 100));
const openOf = (o) => o.in_progress + o.not_attended + o.not_started;
let drift = 0;
for (const [needle, what] of [
  ['return decided === 0 ? null : Math.round((lead / decided) * 100);', 'winRateOf'],
  ['open: outcomes.IN_PROGRESS + outcomes.NOT_ATTENDED + outcomes[NOT_STARTED],', "the strip's Still open"],
  ['lead: outcomes.LEAD,', "the strip's Leads won"],
]) {
  if (!SRC.includes(needle)) { console.error(`DRIFT: ${what} no longer matches this report`); drift++; }
}

const A = 'e-a', B = 'e-b';
const NAMES = { [A]: 'A (recorded it)', [B]: 'B (holds it now)' };

async function run({ assignedTo, updates }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "Employee" (id text primary key, name text, email text, image text, region text, "isActive" boolean) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "Inquiry" (id text primary key, status text, "assignedToId" text) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "ContactMessage" (id text primary key, status text, "assignedToId" text) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "StatusUpdate" (id text primary key, "inquiryId" text, "contactId" text, "employeeId" text, status text, "createdAt" timestamptz) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`INSERT INTO "Employee" VALUES ('${A}','A','a@x.com',null,'Chennai',true),('${B}','B','b@x.com',null,'Chennai',true)`);
    await tx.$executeRawUnsafe(`INSERT INTO "Inquiry" VALUES ('lead-1','new','${assignedTo}')`);
    let n = 0;
    for (const [who, status, hour] of updates) {
      await tx.$executeRawUnsafe(
        `INSERT INTO "StatusUpdate" VALUES ('su-${++n}','lead-1',null,'${who}','${status}','2026-09-21T0${hour}:00:00Z')`
      );
    }
    const people = await tx.$queryRawUnsafe(PER_PERSON.replace('${scope}', 'e."isActive" = true'));
    const [team] = await tx.$queryRawUnsafe(TEAM);
    // The second statement leadPerformance runs: what each person has written,
    // by author, whoever holds the lead now.
    const recorded = await tx.$queryRawUnsafe(`
      SELECT "employeeId",
             COUNT(*)::int AS recorded,
             COUNT(*) FILTER (WHERE status = 'NOT_ATTENDED')::int AS not_attended,
             COUNT(*) FILTER (WHERE status = 'LEAD')::int         AS lead
        FROM "StatusUpdate" GROUP BY "employeeId"`);
    return { people, team, recorded };
  }, { timeout: 30_000, maxWait: 15_000 });
}

const COLS = ['Lead', 'Passed on', 'Working', 'No lead', 'Untouched'];
const pick = (r) => [r.lead, r.not_attended, r.in_progress, r.no_lead, r.not_started];

function report(title, { people, team, recorded }) {
  console.log(`\n${'='.repeat(74)}\n${title}\n${'='.repeat(74)}`);
  console.log('\n  THE TABLE — /admin/team-performance/\n');
  console.log(`  ${'STAFF'.padEnd(18)} ${'ASSIGNED'.padStart(8)} ` +
    COLS.map((c) => c.padStart(10)).join('') + ' ' + 'WIN RATE'.padStart(10));
  for (const p of people) {
    const rate = winRateOf(p.lead, p.no_lead);
    console.log(`  ${NAMES[p.id].padEnd(18)} ${String(p.assigned).padStart(8)} ` +
      pick(p).map((v) => String(v).padStart(10)).join('') + ' ' +
      (rate === null ? '—' : `${rate}%`).padStart(10));
  }
  const byAuthor = new Map(recorded.map((r) => [r.employeeId, r]));
  console.log('\n  THE STRIP — the four figures above the table\n');
  const rate = winRateOf(team.lead, team.no_lead);
  console.log(`    Leads won      ${team.lead}`);
  console.log(`    Team win rate  ${rate === null ? '—  (nothing decided yet)' : `${rate}%  (${team.lead} of ${team.lead + team.no_lead} decided)`}`);
  console.log(`    Active staff   ${people.length}   (${people.reduce((s, p) => s + p.assigned, 0)} leads between them)`);
  console.log(`    Still open     ${openOf(team)}   (in progress, passed on, or not started)`);
  console.log('\n  HELD BY THE ROWS BUT NEVER PRINTED (recorded, by author):\n');
  for (const p of people) {
    const r = byAuthor.get(p.id);
    console.log(`    ${NAMES[p.id].padEnd(18)} recorded=${r?.recorded ?? 0}  of which Not attended=${r?.not_attended ?? 0}, Lead=${r?.lead ?? 0}`);
  }
}

report(
  '1. A records Not attended; the rotation hands the lead to B; B has done nothing',
  await run({ assignedTo: B, updates: [[A, 'NOT_ATTENDED', 1]] })
);
report(
  '2. A records Lead; an admin reassigns the lead to B; B has done nothing',
  await run({ assignedTo: B, updates: [[A, 'LEAD', 1]] })
);

await prisma.$disconnect();
console.log(drift === 0
  ? '\n(the page arithmetic restated here still matches lib/lead-performance.ts)'
  : `\nWARNING: ${drift} drift(s) — this report may no longer describe the screen`);
process.exit(drift === 0 ? 0 : 1);
