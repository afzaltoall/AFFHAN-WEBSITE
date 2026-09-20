// Gives every customer who predates the numbering their AFFHAN number.
//
//   node scripts/backfill_customer_codes.mjs           # preview, writes nothing
//   node scripts/backfill_customer_codes.mjs --apply   # issues the numbers
//
// One customer is one customerKey — the last ten digits of their phone, or
// "email:<address>" when there is no usable phone — which is the same key the
// console's grouped customer card, the staff dashboard and the rotation queue
// all already fold rows on. Every product they asked about and every message
// they sent is one customer and gets one number.
//
// ORDERING. Oldest relationship first, so AFFHAN-0001 is the first customer
// this system ever heard from. A customer's date is the earliest createdAt of
// anything they have ever sent, quote request or contact message, whichever
// came first. Ties break on the key, so the order is the same on every run.
//
// Deleted and spam rows are counted. Recently Deleted is restorable, a
// mis-triaged customer still arrived when they arrived, and leaving either out
// would hand them a number that no longer matched their age.
//
// The numbers come from a Postgres sequence in the column's own DEFAULT, never
// from counting rows here — see src/lib/customerCode.ts. Safe to run again:
// it only touches customers who have no number, so a second run reports 0.

import { createRequire } from "node:module";
import crypto from "node:crypto";
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

const when = (d) =>
  new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });

/**
 * Who has no number yet, oldest first — the same statement lib/customerCode.ts
 * runs, written out here so the script can be read on its own.
 */
async function pending() {
  return prisma.$queryRawUnsafe(`
    WITH contacts AS (
      SELECT "customerKey", "createdAt", 'INQUIRY' AS source FROM "Inquiry"        WHERE "customerKey" IS NOT NULL
      UNION ALL
      SELECT "customerKey", "createdAt", 'CONTACT' AS source FROM "ContactMessage" WHERE "customerKey" IS NOT NULL
    ),
    first_contact AS (
      SELECT DISTINCT ON ("customerKey")
             "customerKey", "createdAt" AS "firstContactAt", source
        FROM contacts
       ORDER BY "customerKey", "createdAt" ASC
    )
    SELECT f."customerKey", f."firstContactAt", f.source
      FROM first_contact f
      LEFT JOIN "CustomerCode" c ON c."customerKey" = f."customerKey"
     WHERE c.id IS NULL
     ORDER BY f."firstContactAt" ASC, f."customerKey" ASC
  `);
}

/** A name to show beside a key, so the preview is readable by a person. */
async function namesFor(keys) {
  if (keys.length === 0) return new Map();
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT "customerKey", name, phone FROM (
      SELECT DISTINCT ON ("customerKey") "customerKey", "customerName" AS name, phone, "createdAt"
        FROM "Inquiry" WHERE "customerKey" = ANY($1::text[]) ORDER BY "customerKey", "createdAt" ASC
    ) i
    UNION ALL
    SELECT "customerKey", name, phone FROM (
      SELECT DISTINCT ON ("customerKey") "customerKey", "fullName" AS name, phone, "createdAt"
        FROM "ContactMessage" WHERE "customerKey" = ANY($1::text[]) ORDER BY "customerKey", "createdAt" ASC
    ) c
  `,
    keys,
  );
  const map = new Map();
  for (const r of rows) if (!map.has(r.customerKey)) map.set(r.customerKey, r);
  return map;
}

const rows = await pending();
const already = await prisma.customerCode.count();

console.log(`\nCustomers already numbered : ${already}`);
console.log(`Customers to number now    : ${rows.length}`);

if (rows.length === 0) {
  console.log("\nNothing to do — every customer has a number.");
  await prisma.$disconnect();
  process.exit(0);
}

// What the numbers will be. The sequence is the authority; this reads where it
// currently stands so the preview shows the real numbers, not guessed ones.
const [seq] = await prisma.$queryRawUnsafe(
  `SELECT last_value::bigint AS last, is_called FROM customer_code_seq`,
);
const start = Number(seq.last) + (seq.is_called ? 1 : 0);
const code = (i) => `AFFHAN-${String(start + i).padStart(4, "0")}`;

const names = await namesFor(rows.map((r) => r.customerKey));
const show = (r, i) => {
  const who = names.get(r.customerKey);
  const name = (who?.name || "(no name on file)").slice(0, 28).padEnd(28);
  const phone = (who?.phone || r.customerKey).slice(0, 18).padEnd(18);
  return `  ${code(i).padEnd(12)} ${name} ${phone} ${when(r.firstContactAt)}  ${r.source}`;
};

console.log(`\nOrdered by first contact, oldest first. First 5:\n`);
rows.slice(0, 5).forEach((r, i) => console.log(show(r, i)));
if (rows.length > 10) console.log(`\n  … ${rows.length - 10} more …\n`);
console.log(`Last 5:\n`);
rows.slice(-5).forEach((r, i) => console.log(show(r, rows.length - 5 + i)));

const byChannel = rows.reduce((acc, r) => ({ ...acc, [r.source]: (acc[r.source] ?? 0) + 1 }), {});
console.log(
  `\nFirst reached us by: ${Object.entries(byChannel).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(", ")}`,
);
console.log(`Date range         : ${when(rows[0].firstContactAt)} → ${when(rows[rows.length - 1].firstContactAt)}`);

if (!apply) {
  console.log("\nPreview only — nothing written. Pass --apply to issue these numbers.");
  await prisma.$disconnect();
  process.exit(0);
}

// One at a time, in this order, because the order IS the numbering: a single
// multi-row INSERT leaves Postgres free to evaluate the sequence as it likes.
// ON CONFLICT DO NOTHING rather than a check-then-insert, so a live submission
// arriving mid-run cannot end up with a second row.
let written = 0;
const issued = [];
for (const r of rows) {
  const out = await prisma.$queryRawUnsafe(
    `INSERT INTO "CustomerCode" ("id", "customerKey", "firstContactAt", "source")
     VALUES ($1, $2, $3, 'BACKFILL')
     ON CONFLICT ("customerKey") DO NOTHING
     RETURNING "code"`,
    crypto.randomUUID(),
    r.customerKey,
    r.firstContactAt,
  );
  if (out.length) {
    written += 1;
    issued.push({ key: r.customerKey, code: out[0].code, at: r.firstContactAt });
  }
}

console.log(`\nIssued ${written} number${written === 1 ? "" : "s"}.`);
if (issued.length) {
  console.log(`  first: ${issued[0].code}  ${when(issued[0].at)}`);
  console.log(`  last : ${issued[issued.length - 1].code}  ${when(issued[issued.length - 1].at)}`);
}

// Prove it, rather than trust the loop: every customer numbered, every number
// unique, and the order still matching the dates it was built from.
const total = await prisma.customerCode.count();
const [check] = await prisma.$queryRawUnsafe(`
  SELECT count(*)::int AS rows, count(DISTINCT code)::int AS codes, count(DISTINCT "customerKey")::int AS keys
    FROM "CustomerCode"
`);
const [outOfOrder] = await prisma.$queryRawUnsafe(`
  SELECT count(*)::int AS n FROM (
    SELECT code, "firstContactAt",
           lag("firstContactAt") OVER (ORDER BY code) AS prev
      FROM "CustomerCode"
  ) t WHERE prev IS NOT NULL AND "firstContactAt" < prev
`);
const left = (await pending()).length;

console.log(`\nAfter: ${total} customers numbered, ${check.codes} distinct numbers, ${check.keys} distinct keys`);
console.log(`Unnumbered customers left : ${left}`);
console.log(`Numbers out of date order : ${outOfOrder.n}`);
console.log(
  check.rows === check.codes && check.rows === check.keys && left === 0 && outOfOrder.n === 0
    ? "\nAll four checks pass."
    : "\nCHECK FAILED — read the four lines above before relying on this.",
);

await prisma.$disconnect();
