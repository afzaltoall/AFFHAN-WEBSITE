// Rewrites StatusUpdate.status from the old sales vocabulary to the new one.
//
//   CONVERTED      -> LEAD           the customer agreed
//   NOT_CONVERTED  -> NO_LEAD        the customer declined
//   FOLLOW_UP      -> IN_PROGRESS    "waiting on them, or on us" is an open
//                                    lead somebody is holding, which is what
//                                    IN_PROGRESS means now
//
// IN_PROGRESS keeps its name and is left alone.
//
// Safe to run at any time, and safe to run again: the site reads both
// vocabularies (LEGACY_STATUS in src/lib/leadStatus.ts), so nothing renders
// wrongly before, during or after this. Run it again after the deploy to catch
// anything the old workspace wrote in between — the second run reports 0.
//
//   node scripts/migrate_lead_statuses.mjs            # dry run, changes nothing
//   node scripts/migrate_lead_statuses.mjs --apply    # writes, after a backup
//
// The backup is a JSON file of every row it is about to touch, written beside
// the script's working directory before anything changes.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const require = createRequire(path.join(root, "package.json"));

for (const file of [".env.local", ".env"]) {
  try {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    const match = text.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
    if (match && !process.env.DATABASE_URL) process.env.DATABASE_URL = match[1];
  } catch {}
}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const MAPPING = {
  CONVERTED: "LEAD",
  NOT_CONVERTED: "NO_LEAD",
  FOLLOW_UP: "IN_PROGRESS",
};

const apply = process.argv.includes("--apply");

const rows = await prisma.statusUpdate.findMany({
  where: { status: { in: Object.keys(MAPPING) } },
  select: { id: true, status: true, note: true, createdAt: true, employeeId: true, inquiryId: true, contactId: true },
  orderBy: { createdAt: "asc" },
});

const counts = {};
for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;

console.log(`${rows.length} row${rows.length === 1 ? "" : "s"} still on the old vocabulary`);
for (const [from, to] of Object.entries(MAPPING)) {
  console.log(`   ${from.padEnd(14)} -> ${to.padEnd(12)} ${counts[from] ?? 0}`);
}

if (rows.length === 0) {
  console.log("\nNothing to do.");
  await prisma.$disconnect();
  process.exit(0);
}

if (!apply) {
  console.log("\nDry run — nothing written. Pass --apply to write.");
  await prisma.$disconnect();
  process.exit(0);
}

const backup = path.join(root, `lead-status-backup-${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify(rows, null, 2));
console.log(`\nbackup: ${backup}`);

let changed = 0;
for (const [from, to] of Object.entries(MAPPING)) {
  const result = await prisma.statusUpdate.updateMany({ where: { status: from }, data: { status: to } });
  if (result.count) console.log(`   ${from} -> ${to}: ${result.count}`);
  changed += result.count;
}

const left = await prisma.statusUpdate.count({ where: { status: { in: Object.keys(MAPPING) } } });
const now = await prisma.statusUpdate.groupBy({ by: ["status"], _count: { _all: true } });
console.log(`\n${changed} rewritten; ${left} left on the old vocabulary`);
console.log("status now:");
for (const row of now.sort((a, b) => b._count._all - a._count._all)) {
  console.log(`   ${row.status.padEnd(14)} ${row._count._all}`);
}

await prisma.$disconnect();
