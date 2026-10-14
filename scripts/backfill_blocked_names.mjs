// Sets Product.isBlockedName from the site's own moderation pattern (src/lib/moderation.ts, blockedNameRegex),
// which the catalogue's queries read instead of running the pattern on every row they touch (2026-10-14).
// Re-runnable: a second run changes nothing.
//
// When: after the migration has added the column and BEFORE the code that reads it is deployed (until it has run,
// every product reads as not blocked); and again whenever moderation.ts's name keywords change. The daily refresh
// (src/lib/snapshots.ts) also re-flags after such a change, in time-boxed runs; this does it in one sitting.
//
//   node scripts/backfill_blocked_names.mjs          # dry run: how many would change, and some of them
//   node scripts/backfill_blocked_names.mjs --apply  # write the flags
//
// The database is DATABASE_URL's. Production only with the owner's go:
//   DATABASE_URL="<production pooled URL>" node scripts/backfill_blocked_names.mjs --apply
//
// In id ranges of 25,000 with a pause between them, so the database is never held by one long statement: the
// pattern on a million names is the load this column exists to take off the site, and it is done here once.
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { blockedNameRegex } from "../src/lib/moderation.ts";

const APPLY = process.argv.includes("--apply");
const BATCH = 25_000;
const PAUSE_MS = 150;

const prisma = new PrismaClient();
const pattern = blockedNameRegex();
const hash = crypto.createHash("sha256").update(pattern).digest("hex");
const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL).hostname;
  } catch {
    return "(DATABASE_URL does not parse)";
  }
})();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`${APPLY ? "APPLY" : "dry run"} on ${host}; pattern ${hash.slice(0, 12)} (${pattern.length} characters)`);
const startedAt = new Date().toISOString();
const [{ top }] = await prisma.$queryRawUnsafe(`SELECT coalesce(max("id"), 0)::int AS top FROM "Product"`);

let toBlock = 0;
let toUnblock = 0;
let blocked = 0;
const samples = [];
for (let lo = 0; lo < top; lo += BATCH) {
  const hi = lo + BATCH;
  const [row] = await prisma.$queryRawUnsafe(
    `SELECT count(*) FILTER (WHERE "name" ~* $1)::int AS blocked,
            count(*) FILTER (WHERE "name" ~* $1 AND NOT "isBlockedName")::int AS "toBlock",
            count(*) FILTER (WHERE "name" !~* $1 AND "isBlockedName")::int AS "toUnblock"
     FROM "Product" WHERE "id" > $2 AND "id" <= $3`,
    pattern,
    lo,
    hi,
  );
  blocked += row.blocked;
  toBlock += row.toBlock;
  toUnblock += row.toUnblock;
  if (samples.length < 12 && row.toBlock) {
    const some = await prisma.$queryRawUnsafe(
      `SELECT "id", "name" FROM "Product" WHERE "id" > $2 AND "id" <= $3 AND "name" ~* $1 AND NOT "isBlockedName" ORDER BY "id" LIMIT 4`,
      pattern,
      lo,
      hi,
    );
    samples.push(...some);
  }
  if (APPLY && (row.toBlock || row.toUnblock)) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Product" SET "isBlockedName" = ("name" ~* $1)
       WHERE "id" > $2 AND "id" <= $3 AND "isBlockedName" IS DISTINCT FROM ("name" ~* $1)`,
      pattern,
      lo,
      hi,
    );
  }
  process.stdout.write(`\r  ids up to ${Math.min(hi, top).toLocaleString("en-IN")} of ${top.toLocaleString("en-IN")}`);
  await sleep(PAUSE_MS);
}
console.log("");
console.log(`blocked by name: ${blocked.toLocaleString("en-IN")}; to flag: ${toBlock}; to unflag: ${toUnblock}`);
for (const s of samples.slice(0, 12)) console.log(`  #${s.id}  ${s.name.slice(0, 90)}`);

if (APPLY) {
  // Tell the daily refresh these flags are this pattern's, so it re-flags only what is written from now on.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Snapshot" ("key", "kind", "value", "computedAt")
     VALUES ('meta:blocked-names', 'meta', jsonb_build_object('v', jsonb_build_object('hash', $1::text, 'at', $2::text)), now())
     ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "computedAt" = now()`,
    hash,
    startedAt,
  );
  console.log("written. Next: the daily refresh (GET /api/cron/refresh/?force=1 with CRON_SECRET) recounts the categories.");
} else {
  console.log("dry run: nothing written. --apply to write.");
}
await prisma.$disconnect();
