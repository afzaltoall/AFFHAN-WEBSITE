// Create the Postgres sequence that TripApplication.referenceNo draws from.
//
//   node scripts/create_trip_ref_seq.mjs
//
// Run once, before the `prisma db push` that creates TripApplication. The
// column's DEFAULT calls nextval('trip_ref_seq'), and Postgres refuses to
// create a default naming a sequence that does not exist yet; Prisma does not
// manage sequences, so it will not make one. The same reason, and the same
// script, as scripts/create_shipment_ref_seq.mjs: this is the written record
// of where the sequence came from.
//
// Safe to run again. IF NOT EXISTS means it never recreates, and so never
// resets, a sequence that is already handing out numbers.

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

try {
  await prisma.$executeRawUnsafe("CREATE SEQUENCE IF NOT EXISTS trip_ref_seq");
  const [seq] = await prisma.$queryRawUnsafe(
    "SELECT last_value::bigint AS last, is_called FROM trip_ref_seq",
  );
  const next = Number(seq.last) + (seq.is_called ? 1 : 0);
  console.log(`trip_ref_seq is in place; the next reference number is ${String(next).padStart(5, "0")}.`);
} finally {
  await prisma.$disconnect();
}
