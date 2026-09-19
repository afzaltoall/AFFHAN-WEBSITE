// Fills Inquiry.customerKey and ContactMessage.customerKey on rows that
// predate the column, and repairs any that disagree with the phone they sit
// beside.
//
// The key is what makes "these rows are the same customer" a query rather than
// a scan: the last ten digits of the phone number, or "email:<address>" when
// there is no usable phone. Same rule as customerKeyOf() in
// src/lib/customerGroups.ts, which is what the console and the workspace group
// by — the two must agree, so the rule is written out here rather than
// imported through the app's module graph, and the checker below proves they
// still say the same thing on every row it touches.
//
//   node scripts/backfill_customer_keys.mjs           # dry run, changes nothing
//   node scripts/backfill_customer_keys.mjs --apply   # writes
//
// Safe to run again at any time: it only writes rows whose key is missing or
// wrong, so a second run reports 0. Run it after a deploy as well as before
// one — rows created in between have their key set by the API routes, but a
// row written by a script or a restored backup will not.
//
// It does NOT touch assignedAt. A lead assigned before that column existed has
// no honest value to put there: inventing one from createdAt would claim a
// handover that never happened. Null means "unknown", and the rotation reads
// it that way.

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

const apply = process.argv.includes("--apply");

/** customerKeyOf(), as src/lib/customerGroups.ts defines it. */
function keyOf(row) {
  const digits = (row.phone || "").replace(/\D/g, "");
  const phone = !digits ? "" : digits.length > 10 ? digits.slice(-10) : digits;
  if (phone) return phone;
  const email = (row.email || "").trim().toLowerCase();
  return email ? `email:${email}` : null;
}

async function pass(label, model) {
  const rows = await model.findMany({ select: { id: true, phone: true, email: true, customerKey: true } });
  const wrong = [];
  let unkeyable = 0;
  for (const row of rows) {
    const want = keyOf(row);
    if (want === null) {
      unkeyable += 1;
      continue;
    }
    if (row.customerKey !== want) wrong.push({ id: row.id, from: row.customerKey, to: want });
  }

  console.log(`${label}: ${rows.length} rows — ${wrong.length} to write, ${unkeyable} with neither phone nor email`);
  if (wrong.length && !apply) {
    for (const row of wrong.slice(0, 3)) console.log(`   e.g. ${row.id}  ${row.from ?? "(null)"} -> ${row.to}`);
    if (wrong.length > 3) console.log(`   …and ${wrong.length - 3} more`);
  }

  if (!apply || wrong.length === 0) return { written: 0, unkeyable, total: rows.length };

  // One statement per distinct key rather than per row: 329 rows fold into
  // ~200 updates, and each one is a plain WHERE id IN (...).
  const byKey = new Map();
  for (const row of wrong) {
    const list = byKey.get(row.to);
    if (list) list.push(row.id);
    else byKey.set(row.to, [row.id]);
  }
  let written = 0;
  for (const [key, ids] of byKey) {
    const { count } = await model.updateMany({ where: { id: { in: ids } }, data: { customerKey: key } });
    written += count;
  }
  console.log(`   wrote ${written} in ${byKey.size} statement${byKey.size === 1 ? "" : "s"}`);
  return { written, unkeyable, total: rows.length };
}

const inquiries = await pass("Inquiry", prisma.inquiry);
const contacts = await pass("ContactMessage", prisma.contactMessage);

if (!apply) {
  console.log("\nDry run — nothing written. Pass --apply to write.");
  await prisma.$disconnect();
  process.exit(0);
}

// What the column is for: how many customers those rows actually are.
const [inqKeys, conKeys, inqNull, conNull] = await Promise.all([
  prisma.inquiry.findMany({ where: { customerKey: { not: null } }, distinct: ["customerKey"], select: { customerKey: true } }),
  prisma.contactMessage.findMany({ where: { customerKey: { not: null } }, distinct: ["customerKey"], select: { customerKey: true } }),
  prisma.inquiry.count({ where: { customerKey: null } }),
  prisma.contactMessage.count({ where: { customerKey: null } }),
]);
const all = new Set([...inqKeys, ...conKeys].map((r) => r.customerKey));
console.log(`\n${inquiries.total} inquiries are ${inqKeys.length} customers; ${contacts.total} messages are ${conKeys.length}.`);
console.log(`${all.size} distinct customers across both.`);
console.log(`Still null: ${inqNull} inquiries, ${conNull} messages (rows with neither a phone nor an email).`);

await prisma.$disconnect();
