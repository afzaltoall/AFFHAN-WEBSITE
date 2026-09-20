import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { customerKeyOf } from "@/lib/customerGroups";

/**
 * The customer's permanent number: AFFHAN-0001, AFFHAN-0002, and so on.
 *
 * One customer is one number, for life. "One customer" is not "one inquiry"
 * and not "one product" — it is one customerKey, the normalised phone (or
 * email, failing that) that customerKeyOf() in lib/customerGroups.ts has
 * defined since the console started collapsing duplicate rows. A person who
 * asks about six products across three quote requests and then writes in
 * through Contact Us is six Inquiry rows, one ContactMessage, and exactly one
 * AFFHAN number — the same one the grouped customer card has always drawn
 * around them. Nothing here introduces a second idea of who a customer is.
 *
 * It has nothing to do with a product's id (/products/611734/). Two unrelated
 * numbering systems that happen to appear on the same screen.
 *
 * WHY A TABLE. There was no row anywhere that meant "a customer". The console
 * and the workspace both fold rows into customers in memory, per request, and
 * LeadQueueEntry is one row per customer but only while the rotation has them,
 * and only for those the rotation ever touched. A number has to outlive all of
 * that, so it needs somewhere to live: CustomerCode, one row per key, written
 * once.
 *
 * WHY NOT COMPUTED. Anything derived from position — row order, a running
 * count, "how many customers are older than this one" — changes the moment an
 * older inquiry is deleted or a new customer arrives out of order. The number
 * is stored, and after that nothing recomputes it.
 */

type Db = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/** Four digits: 9,999 customers of headroom against the ~264 there are today. */
export const CUSTOMER_CODE_PAD = 4;

export const CUSTOMER_CODE_PREFIX = "AFFHAN-";

/**
 * The display form of a number, for scripts and tests.
 *
 * The database writes the real ones through the column's DEFAULT (see
 * CustomerCode.code in schema.prisma), so this must stay identical to that
 * expression — it exists to show a number that has not been issued yet, never
 * to issue one.
 */
export function formatCustomerCode(n: number): string {
  return `${CUSTOMER_CODE_PREFIX}${String(n).padStart(CUSTOMER_CODE_PAD, "0")}`;
}

/** What a row needs to carry for a number to be issued against it. */
export interface Contactable {
  phone?: string | null;
  email?: string | null;
}

/**
 * Give this customer their number, or hand back the one they already have.
 *
 * One statement, and deliberately so. The number comes from a Postgres
 * sequence in the column's DEFAULT, the unique index on customerKey decides
 * who wins a tie, and ON CONFLICT turns the loser's INSERT into an UPDATE that
 * returns the winner's code — so two first-ever messages from the same
 * customer arriving in the same instant end with one row and one number, and
 * two from DIFFERENT customers can never be handed the same one. No read
 * happens before the write, which is the pattern that would make both of those
 * possible.
 *
 * The conflict path also pulls firstContactAt earlier when an older row turns
 * up (a backfill running beside live traffic, a message imported late). It
 * never pushes it later, and it never touches the code.
 *
 * Returns null when the row has neither phone nor email — nobody we could
 * contact, and nothing to key a customer on. The caller carries on: a number
 * is a label on a lead, never a condition of accepting one.
 */
export async function ensureCustomerCode(
  row: Contactable,
  firstContactAt: Date,
  source: "INQUIRY" | "CONTACT",
  db: Db = prisma,
): Promise<string | null> {
  const key = customerKeyOf(row);
  if (!key) return null;
  return ensureCodeForKey(key, firstContactAt, source, db);
}

/**
 * The same, for a key that has already been worked out.
 *
 * The lookup first is not laziness, and it is not the read-then-write this
 * module warns about — the write below is still atomic and still guarded by
 * the unique index, so a customer who slips past this read cannot get a second
 * row. It is here because Postgres evaluates a column DEFAULT *before* it
 * detects the conflict: without it, every repeat contact from an existing
 * customer would call nextval and throw the number away. Measured on the
 * rehearsal, four contacts from two people reached AFFHAN-0004 — numbers
 * running away from customers, for nothing. Now only a genuine first contact
 * touches the sequence.
 */
export async function ensureCodeForKey(
  key: string,
  firstContactAt: Date,
  source: string,
  db: Db = prisma,
): Promise<string | null> {
  const known = await db.customerCode.findUnique({
    where: { customerKey: key },
    select: { code: true },
  });
  if (known) return known.code;

  const rows = await db.$queryRaw<{ code: string }[]>`
    INSERT INTO "CustomerCode" ("id", "customerKey", "firstContactAt", "source")
    VALUES (${randomUUID()}, ${key}, ${firstContactAt}, ${source})
    ON CONFLICT ("customerKey") DO UPDATE
       SET "firstContactAt" = LEAST("CustomerCode"."firstContactAt", EXCLUDED."firstContactAt")
    RETURNING "code"
  `;
  return rows[0]?.code ?? null;
}

/**
 * key → AFFHAN-xxxx, for the screens.
 *
 * The whole table, because it is one short row per customer and the callers
 * (the console, a member of staff's board) fold their rows into customers in
 * the browser — they do not know which keys they will need until after they
 * have grouped, and a second round trip per screen to find out would cost more
 * than the rows do.
 */
export async function customerCodeMap(db: Db = prisma): Promise<Record<string, string>> {
  const rows = await db.customerCode.findMany({ select: { customerKey: true, code: true } });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.customerKey] = r.code;
  return map;
}

/**
 * The same map, for a known set of customers.
 *
 * What a member of staff's own board wants: they hold a few dozen customers,
 * not the book, and the keys are already in the rows the page has just read.
 */
export async function customerCodesFor(
  keys: (string | null | undefined)[],
  db: Db = prisma,
): Promise<Record<string, string>> {
  const unique = [...new Set(keys.filter((k): k is string => Boolean(k)))];
  if (unique.length === 0) return {};
  const rows = await db.customerCode.findMany({
    where: { customerKey: { in: unique } },
    select: { customerKey: true, code: true },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.customerKey] = r.code;
  return map;
}

/**
 * Number everybody who is missing one, oldest relationship first.
 *
 * The backfill's engine, and also the safety net the rotation job runs: a row
 * whose customerKey was null when it was created (and filled in later by
 * fillMissingKeys) never passed through the issuing path, and this is what
 * catches it. Ordering is by earliest contact of any kind, so a customer who
 * wrote in through Contact Us in June and asked for a quote in August is
 * numbered from June.
 *
 * Returns what it issued, in the order it issued them.
 */
export async function issueMissingCodes(
  db: Db = prisma,
  source = "BACKFILL",
): Promise<{ customerKey: string; code: string; firstContactAt: Date }[]> {
  const pending = await pendingCustomers(db);
  const issued: { customerKey: string; code: string; firstContactAt: Date }[] = [];
  // One at a time and in order, because the order IS the numbering: a single
  // multi-row INSERT leaves Postgres free to evaluate the sequence in whatever
  // order it likes.
  for (const c of pending) {
    const code = await ensureCodeForKey(c.customerKey, c.firstContactAt, source, db);
    if (code) issued.push({ customerKey: c.customerKey, firstContactAt: c.firstContactAt, code });
  }
  return issued;
}

/**
 * Who has no number yet, oldest first.
 *
 * Both tables, folded on the key they already share, taking the earliest
 * createdAt of everything that customer has ever sent. Deleted and spam rows
 * count: Recently Deleted is restorable, a mis-triaged customer still arrived
 * when they arrived, and leaving either out would mean the number they were
 * given later no longer matched their age.
 *
 * Ties — two customers whose first contact lands in the same millisecond —
 * break on the key, so two runs of this produce the same order.
 */
export async function pendingCustomers(
  db: Db = prisma,
): Promise<{ customerKey: string; firstContactAt: Date; source: string }[]> {
  return db.$queryRaw<{ customerKey: string; firstContactAt: Date; source: string }[]>`
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
  `;
}
