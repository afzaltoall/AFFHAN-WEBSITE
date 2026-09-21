import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// Does a lead's outcome still bleed onto whoever holds it next?
//
//   node tools/audit/95-attribution.mjs
//
// Two halves.
//
// LIVE: runs the real leadPerformance() and assignedOutcomes() against the
// real database and prints what the team page would show. The bug this was
// written for is one row of it — SAMSUTHEEN reading "Passed on 1 · 100%" for
// a customer Khaja passed on before the handover.
//
// SCENARIOS: the same SQL, read out of lib/lead-performance.ts so it cannot
// drift, run over TEMP TABLES that shadow the real ones. Postgres resolves an
// unqualified "StatusUpdate" to pg_temp first, so the production statement
// runs unchanged against made-up rows; ON COMMIT DROP means nothing outlives
// the transaction and nothing is ever written to the real tables. That is how
// the cases live data does not contain — a won lead handed on, a customer who
// came back round — get tested at all.

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

let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (detail) console.log(`        ${detail}`);
};

// ---------------------------------------------------------------- the SQL
// Lifted from the module rather than copied, so a change there is a change
// here. The two template literals are found by their leading CTE.
const SRC = fs.readFileSync(path.join(root, 'src/lib/lead-performance.ts'), 'utf8')
  .split('\r\n').join('\n');

function literalAfter(marker) {
  const at = SRC.indexOf(marker);
  if (at < 0) throw new Error(`lead-performance.ts no longer contains: ${marker}`);
  const open = SRC.lastIndexOf('`', at);
  const close = SRC.indexOf('`', at);
  if (open < 0 || close < 0) throw new Error('could not find the template literal');
  return SRC.slice(open + 1, close);
}

const ASSIGNED_LEADS = literalAfter('leads AS (\n    SELECT id, "assignedToId"');
const PER_PERSON = literalAfter('WITH mine AS (').replace('${ASSIGNED_LEADS}', ASSIGNED_LEADS);
const TEAM = literalAfter("WITH latest AS (").replace('${ASSIGNED_LEADS}', ASSIGNED_LEADS);

// ------------------------------------------------------------------ live
console.log('=== LIVE — the production statements against the real database\n');

// The module is TypeScript and imports "@/lib/prisma", so rather than compile
// the app just to read it, its two statements are run directly — the same
// text, lifted above, with only the scope fragment filled in.
const liveRows = await prisma.$queryRawUnsafe(
  PER_PERSON.replace('${scope}', 'e."isActive" = true')
);
const [liveTeam] = await prisma.$queryRawUnsafe(TEAM);

for (const r of liveRows.filter((r) => r.assigned > 0)) {
  console.log(`  ${String(r.name).padEnd(17)} assigned=${r.assigned}  LEAD=${r.lead} NO_LEAD=${r.no_lead} ` +
    `NOT_ATT=${r.not_attended} IN_PROG=${r.in_progress} INVALID=${r.invalid} NOT_STARTED=${r.not_started}`);
}
console.log(`  team strip: ${JSON.stringify(liveTeam)}\n`);

const holder = liveRows.find((r) => r.assigned > 0);
if (holder) {
  check(holder.not_attended === 0,
    'the current holder no longer inherits the previous holder\'s "Not attended"',
    `${holder.name}: NOT_ATT=${holder.not_attended}, NOT_STARTED=${holder.not_started}`);
  check(holder.not_started === holder.assigned,
    'a lead they have written nothing on reads as Not started for them');
}
const sums = liveRows.every((r) =>
  r.lead + r.no_lead + r.not_attended + r.in_progress + r.invalid + r.not_started === r.assigned);
check(sums, 'every row\'s five buckets still add up to their assigned total');
check(liveTeam.not_attended === 1,
  'the strip still counts the lead somebody passed on — it did not vanish with the attribution',
  JSON.stringify(liveTeam));

// ------------------------------------------------------------- scenarios
console.log('\n=== SCENARIOS — the same SQL over temp tables, nothing written\n');

const E = { khaja: 'e-khaja', sams: 'e-sams', karan: 'e-karan' };
const scenario = async (name, { assignedTo, updates }) => {
  const rows = await prisma.$transaction(async (tx) => {
    // pg_temp comes before public on the search path, so the production
    // statement below reads these and never the real tables.
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "Employee" (id text primary key, name text, email text, image text, region text, "isActive" boolean) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "Inquiry" (id text primary key, status text, "assignedToId" text) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "ContactMessage" (id text primary key, status text, "assignedToId" text) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "StatusUpdate" (id text primary key, "inquiryId" text, "contactId" text, "employeeId" text, status text, "createdAt" timestamptz) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(
      `INSERT INTO "Employee" VALUES ('${E.khaja}','KHAJA','k@a.com',null,null,true),` +
      `('${E.sams}','SAMSUTHEEN','s@a.com',null,null,true),('${E.karan}','KARAN','c@a.com',null,null,true)`
    );
    await tx.$executeRawUnsafe(`INSERT INTO "Inquiry" VALUES ('lead-1','new','${assignedTo}')`);
    let n = 0;
    for (const [who, status, minute] of updates) {
      await tx.$executeRawUnsafe(
        `INSERT INTO "StatusUpdate" VALUES ('su-${++n}','lead-1',null,'${who}','${status}','2026-09-21T0${minute}:00:00Z')`
      );
    }
    const people = await tx.$queryRawUnsafe(PER_PERSON.replace('${scope}', 'e."isActive" = true'));
    const [team] = await tx.$queryRawUnsafe(TEAM);
    return { people, team };
  }, { timeout: 30_000, maxWait: 15_000 });

  const of = (id) => rows.people.find((p) => p.id === id);
  const bucket = (r) => !r || r.assigned === 0 ? 'no leads'
    : r.lead ? 'Lead' : r.no_lead ? 'No lead' : r.not_attended ? 'Passed on'
    : r.in_progress ? 'Working' : r.invalid ? 'Invalid' : 'Not started';
  return { name, of, bucket, team: rows.team, people: rows.people };
};

// 1. The reported bug, from first principles.
{
  const s = await scenario('handed on after Not attended', {
    assignedTo: E.sams,
    updates: [[E.khaja, 'NOT_ATTENDED', 1]],
  });
  check(s.bucket(s.of(E.sams)) === 'Not started',
    'Khaja passes on, Samsutheen receives: Samsutheen reads Not started',
    `Samsutheen -> ${s.bucket(s.of(E.sams))}`);
  check(s.of(E.khaja).assigned === 0,
    'and Khaja no longer has it in his book at all');
  check(s.team.not_attended === 1,
    'the strip still knows the lead was passed on',
    `team: ${JSON.stringify(s.team)}`);
}

// 2. The case that made the strip a separate query.
{
  const s = await scenario('a won lead reassigned for fulfilment', {
    assignedTo: E.sams,
    updates: [[E.khaja, 'LEAD', 1]],
  });
  check(s.bucket(s.of(E.sams)) === 'Not started',
    'Khaja wins it, an admin moves it to Samsutheen: Samsutheen is not credited',
    `Samsutheen -> ${s.bucket(s.of(E.sams))}`);
  check(s.team.lead === 1,
    'but the team strip still counts the win — this is why it counts leads, not people',
    `team.lead = ${s.team.lead}`);
}

// 3. Their own work survives somebody else's, and a round trip.
{
  const s = await scenario('the customer comes back round', {
    assignedTo: E.sams,
    updates: [[E.sams, 'IN_PROGRESS', 1], [E.khaja, 'NOT_ATTENDED', 2]],
  });
  check(s.bucket(s.of(E.sams)) === 'Working',
    'Samsutheen worked it, it left him, it came back: his own last word stands',
    `Samsutheen -> ${s.bucket(s.of(E.sams))}`);
  check(s.team.not_attended === 1,
    'the strip reads the lead\'s newest entry, which is Khaja\'s',
    `team: ${JSON.stringify(s.team)}`);
}

// 4. The ordinary case has not moved.
{
  const s = await scenario('nobody else involved', {
    assignedTo: E.sams,
    updates: [[E.sams, 'IN_PROGRESS', 1], [E.sams, 'LEAD', 2]],
  });
  check(s.bucket(s.of(E.sams)) === 'Lead',
    'a person working their own lead is counted exactly as before',
    `Samsutheen -> ${s.bucket(s.of(E.sams))}`);
  check(s.team.lead === 1, 'and the strip agrees');
}

// 5. Nothing was written. The temp tables shadowed the real ones; prove the
//    real ones are untouched by asking them again.
const after = await prisma.statusUpdate.count();
const employees = await prisma.employee.count();
check(after === 1 && !(await prisma.employee.findUnique({ where: { id: E.khaja } })),
  'the real tables are untouched — no synthetic rows survived',
  `StatusUpdate ${after} rows, Employee ${employees} rows, no 'e-khaja'`);

await prisma.$disconnect();
console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}`);
process.exit(failures === 0 ? 0 : 1);
