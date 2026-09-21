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
// "Recorded by them" — the by-author half, counted in customers.
const RECORDED = literalAfter('WITH acts AS (');
// What it replaced, kept here only so the overcount can be shown rather than
// asserted. Nothing in the app runs this any more.
const RECORDED_OLD = `
  SELECT "employeeId",
         COUNT(*)::int                                                        AS recorded,
         COUNT(*) FILTER (WHERE status = 'NOT_ATTENDED')::int                 AS passed_on,
         COUNT(*) FILTER (WHERE status = 'LEAD')::int                         AS won,
         COUNT(*) FILTER (WHERE "createdAt" >= now() - interval '7 days')::int AS this_week
    FROM "StatusUpdate"
   GROUP BY "employeeId"`;

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

async function run({ assignedTo, updates, leads = ['lead-1'], customerKey = 'cust-1' }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "Employee" (id text primary key, name text, email text, image text, region text, "isActive" boolean) ON COMMIT DROP`);
    // customerKey is what the by-author half groups on, so the temp tables
    // have to carry it exactly as the real ones do.
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "Inquiry" (id text primary key, status text, "assignedToId" text, "customerKey" text) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "ContactMessage" (id text primary key, status text, "assignedToId" text, "customerKey" text) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "StatusUpdate" (id text primary key, "inquiryId" text, "contactId" text, "employeeId" text, status text, "createdAt" timestamptz) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`INSERT INTO "Employee" VALUES ('${A}','A','a@x.com',null,'Chennai',true),('${B}','B','b@x.com',null,'Chennai',true)`);
    // One customer, however many products they asked about: several Inquiry
    // rows sharing one customerKey, which is exactly the shape the overcount
    // was hiding in.
    await tx.$executeRawUnsafe(
      'INSERT INTO "Inquiry" VALUES ' +
      leads.map((id) => `('${id}','new','${assignedTo}','${customerKey}')`).join(',')
    );
    let n = 0;
    for (const [who, status, hour] of updates) {
      // One action writes one row per product, all at the same instant — the
      // status route does this deliberately, so the rows are provably one act.
      for (const leadId of leads) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "StatusUpdate" VALUES ('su-${++n}','${leadId}',null,'${who}','${status}','2026-09-21T0${hour}:00:00Z')`
        );
      }
    }
    const people = await tx.$queryRawUnsafe(PER_PERSON.replace('${scope}', 'e."isActive" = true'));
    const [team] = await tx.$queryRawUnsafe(TEAM);
    // The second statement leadPerformance runs, and the one it replaced.
    const recorded = await tx.$queryRawUnsafe(RECORDED);
    const before = await tx.$queryRawUnsafe(RECORDED_OLD);
    return { people, team, recorded, before };
  }, { timeout: 30_000, maxWait: 15_000 });
}

const COLS = ['Lead', 'Passed on', 'Working', 'No lead', 'Untouched'];
const pick = (r) => [r.lead, r.not_attended, r.in_progress, r.no_lead, r.not_started];

function report(title, { people, team, recorded, before }) {
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
  const wasAuthor = new Map((before ?? []).map((r) => [r.employeeId, r]));
  console.log('\n  THE STRIP — the four figures above the table\n');
  const rate = winRateOf(team.lead, team.no_lead);
  console.log(`    Leads won      ${team.lead}`);
  console.log(`    Team win rate  ${rate === null ? '—  (nothing decided yet)' : `${rate}%  (${team.lead} of ${team.lead + team.no_lead} decided)`}`);
  console.log(`    Active staff   ${people.length}   (${people.reduce((s, p) => s + p.assigned, 0)} leads between them)`);
  console.log(`    Still open     ${openOf(team)}   (in progress, passed on, or not started)`);
  console.log('\n  RECORDED BY THEM — the fenced group of columns\n');
  console.log(`  ${'STAFF'.padEnd(18)} ${'Recorded'.padStart(10)}${'Passed on'.padStart(11)}${'Leads won'.padStart(11)}${'This week'.padStart(11)}`);
  for (const p of people) {
    const r = byAuthor.get(p.id);
    console.log(`  ${NAMES[p.id].padEnd(18)} ${String(r?.recorded ?? 0).padStart(10)}${String(r?.passed_on ?? 0).padStart(11)}${String(r?.won ?? 0).padStart(11)}${String(r?.this_week ?? 0).padStart(11)}`);
  }
  if (before) {
    console.log('\n    what COUNT(*) would have said (the overcount this replaced):');
    for (const p of people) {
      const w = wasAuthor.get(p.id), r = byAuthor.get(p.id);
      const same = (w?.recorded ?? 0) === (r?.recorded ?? 0) && (w?.passed_on ?? 0) === (r?.passed_on ?? 0);
      console.log(`      ${NAMES[p.id].padEnd(18)} recorded=${w?.recorded ?? 0} passed_on=${w?.passed_on ?? 0} won=${w?.won ?? 0}` +
        (same ? '   (same)' : '   <-- OVERCOUNT'));
    }
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
report(
  '3. One customer, THREE products: A marks Not attended once (3 rows)',
  await run({ assignedTo: B, updates: [[A, 'NOT_ATTENDED', 1]], leads: ['lead-1', 'lead-2', 'lead-3'] })
);
report(
  '4. A records In progress then Lead on one lead (2 rows, one customer)',
  await run({ assignedTo: A, updates: [[A, 'IN_PROGRESS', 1], [A, 'LEAD', 2]] })
);

await prisma.$disconnect();
console.log(drift === 0
  ? '\n(the page arithmetic restated here still matches lib/lead-performance.ts)'
  : `\nWARNING: ${drift} drift(s) — this report may no longer describe the screen`);
process.exit(drift === 0 ? 0 : 1);
