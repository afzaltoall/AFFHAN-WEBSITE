import "server-only";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { istDate, istLastDay } from "@/lib/trip-referral-shared";
import {
  INSTAGRAM_DEFAULTS,
  instagramTaskRunning,
  personProgress,
  type CheckState,
  type InstagramAccountView,
  type InstagramBoardView,
  type InstagramEventKind,
  type InstagramEventView,
  type InstagramPersonRow,
  type InstagramPrizeView,
  type InstagramSettingsView,
} from "@/lib/instagram-task-shared";

/**
 * The office's Instagram task (the owner, 2026-11-23), every read and write: the settings, each employee's accounts,
 * the checks, the trackers and the prizes. Plain SQL, as the lucky draw's TripDraw is, so this works on a database whose
 * Prisma client was made before these tables (the owner's localhost until `prisma generate`), and a database the
 * migration has not reached reads as a task not set up (isMissingInstagramTables) rather than failing the page.
 *
 * Who may do what, which every route asks of these functions and these functions check again:
 *   - an employee (any job) adds, reports, renames and removes their own accounts, only while the task runs and
 *     until their prize is given;
 *   - a tracker (an employee in InstagramTracker, HR) is an employee who also reads everyone and checks anyone's
 *     accounts but their own: theirs are checked by an admin or another tracker, as the prize is real money;
 *   - an admin reads and checks everyone, sets the task, names the trackers and gives the prizes.
 * Every change to one person's accounts takes that person's lock, so two presses can never add a sixth account, and a
 * check or a change can never land after their prize.
 */

export class InstagramTaskError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type InstagramActor =
  | { kind: "employee"; id: string; name: string; tracker: boolean }
  | { kind: "admin"; name: string };
type EmployeeActor = Extract<InstagramActor, { kind: "employee" }>;

const SETTINGS_ID = "instagram";
/** The database's own clock, in UTC as Prisma keeps every DateTime. */
const NOW = Prisma.sql`clock_timestamp() AT TIME ZONE 'UTC'`;
const personLock = (employeeId: string) =>
  Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`affhan-instagram:${employeeId}`}))`;

/** The tables are not there yet: the migration has not been applied to this database. */
export function isMissingInstagramTables(e: unknown): boolean {
  const text = e instanceof Error ? e.message : String(e);
  return /relation "Instagram\w*" does not exist|42P01/.test(text);
}
const isUniqueViolation = (e: unknown) => /23505|duplicate key value|unique constraint/i.test(e instanceof Error ? e.message : String(e));
const iso = (d: Date | null) => (d ? d.toISOString() : null);

// ---- reads ----

interface SettingsRow {
  enabled: boolean;
  accountsPerPerson: number;
  postsPerAccount: number;
  followersPerAccount: number;
  prizeRupees: number;
  startsAt: Date | null;
  endsAt: Date | null;
  changedBy: string | null;
  updatedAt: Date | null;
}
const SETTINGS_SQL = Prisma.sql`
  SELECT "enabled", "accountsPerPerson", "postsPerAccount", "followersPerAccount", "prizeRupees", "startsAt", "endsAt", "changedBy", "updatedAt"
  FROM "InstagramTaskSettings" WHERE "id" = ${SETTINGS_ID}`;
const toSettings = (rows: SettingsRow[]): InstagramSettingsView => {
  const r = rows[0];
  return r ? { ...r, startsAt: iso(r.startsAt), endsAt: iso(r.endsAt), updatedAt: iso(r.updatedAt) } : INSTAGRAM_DEFAULTS;
};

interface AccountRow {
  id: string;
  employeeId: string;
  handle: string;
  posts: number;
  followers: number;
  reportedAt: Date;
  checkState: string | null;
  checkedPosts: number | null;
  checkedFollowers: number | null;
  checkNote: string | null;
  checkedBy: string | null;
  checkedAt: Date | null;
  createdAt: Date;
}
const ACCOUNT_COLS = Prisma.sql`"id", "employeeId", "handle", "posts", "followers", "reportedAt", "checkState", "checkedPosts", "checkedFollowers", "checkNote", "checkedBy", "checkedAt", "createdAt"`;
const toAccount = (r: AccountRow): InstagramAccountView => ({
  ...r,
  checkState: r.checkState === "checked" || r.checkState === "rejected" ? r.checkState : null,
  reportedAt: r.reportedAt.toISOString(),
  checkedAt: iso(r.checkedAt),
  createdAt: r.createdAt.toISOString(),
});

interface PrizeRow {
  employeeId: string;
  amount: number;
  note: string | null;
  givenBy: string;
  givenAt: Date;
}
const toPrize = (r: PrizeRow): InstagramPrizeView => ({ amount: r.amount, note: r.note, givenBy: r.givenBy, givenAt: r.givenAt.toISOString() });

/** The task's settings, or its defaults until the console saves them. */
export async function instagramSettings(): Promise<InstagramSettingsView> {
  return toSettings(await prisma.$queryRaw<SettingsRow[]>(SETTINGS_SQL));
}

/** Whether this employee checks everyone's accounts. No tables yet, nobody does. */
export async function isInstagramTracker(employeeId: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ one: number }[]>`SELECT 1 AS one FROM "InstagramTracker" WHERE "employeeId" = ${employeeId}`;
    return rows.length > 0;
  } catch (e) {
    if (isMissingInstagramTables(e)) return false;
    throw e;
  }
}

export interface MyInstagramView {
  settings: InstagramSettingsView;
  accounts: InstagramAccountView[];
  prize: InstagramPrizeView | null;
  tracker: boolean;
}

/** An employee's own page: the task, their accounts in the order added, their prize, and whether they track. */
export async function myInstagram(employeeId: string): Promise<MyInstagramView> {
  const [settings, accounts, prizes, tracker] = await Promise.all([
    instagramSettings(),
    prisma.$queryRaw<AccountRow[]>`SELECT ${ACCOUNT_COLS} FROM "InstagramAccount" WHERE "employeeId" = ${employeeId} ORDER BY "createdAt", "id"`,
    prisma.$queryRaw<PrizeRow[]>`SELECT * FROM "InstagramPrize" WHERE "employeeId" = ${employeeId}`,
    isInstagramTracker(employeeId),
  ]);
  return { settings, accounts: accounts.map(toAccount), prize: prizes[0] ? toPrize(prizes[0]) : null, tracker };
}

/**
 * Everyone, for a tracker and an admin: every employee still here, and anyone who left with accounts or a prize in the
 * task (so nothing they did drops off the board), each with their accounts and prize. Ordered by name; the board
 * orders by progress itself, as it reads again every half minute.
 */
export async function instagramBoard(): Promise<InstagramBoardView> {
  const [settings, accounts, prizes, trackers] = await Promise.all([
    instagramSettings(),
    prisma.$queryRaw<AccountRow[]>`SELECT ${ACCOUNT_COLS} FROM "InstagramAccount" ORDER BY "createdAt", "id"`,
    prisma.$queryRaw<PrizeRow[]>`SELECT * FROM "InstagramPrize"`,
    prisma.$queryRaw<{ employeeId: string }[]>`SELECT "employeeId" FROM "InstagramTracker"`,
  ]);
  const inTask = [...new Set([...accounts.map((a) => a.employeeId), ...prizes.map((p) => p.employeeId)])];
  const employees = await prisma.employee.findMany({
    where: { OR: [{ isActive: true }, { id: { in: inTask } }] },
    select: { id: true, name: true, email: true, isActive: true },
    orderBy: { name: "asc" },
  });
  const tracking = new Set(trackers.map((t) => t.employeeId));
  const prizeOf = new Map(prizes.map((p) => [p.employeeId, toPrize(p)]));
  const accountsOf = new Map<string, InstagramAccountView[]>();
  for (const a of accounts) {
    const list = accountsOf.get(a.employeeId) ?? [];
    list.push(toAccount(a));
    accountsOf.set(a.employeeId, list);
  }
  const people: InstagramPersonRow[] = employees.map((e) => ({
    employeeId: e.id,
    name: e.name,
    email: e.email,
    isActive: e.isActive,
    tracker: tracking.has(e.id),
    accounts: accountsOf.get(e.id) ?? [],
    prize: prizeOf.get(e.id) ?? null,
  }));
  return { settings, people, readAt: new Date().toISOString() };
}

interface EventRow {
  id: string;
  accountId: string | null;
  handle: string;
  kind: string;
  posts: number | null;
  followers: number | null;
  note: string | null;
  byName: string;
  at: Date;
}

/** One person's history, newest first: everything done to their accounts, by them and by whoever checked them. */
export async function instagramHistory(employeeId: string, limit = 300): Promise<InstagramEventView[]> {
  const rows = await prisma.$queryRaw<EventRow[]>`
    SELECT "id", "accountId", "handle", "kind", "posts", "followers", "note", "byName", "at"
    FROM "InstagramAccountEvent" WHERE "employeeId" = ${employeeId}
    ORDER BY "at" DESC, "id" DESC LIMIT ${limit}`;
  return rows.map((r) => ({ ...r, kind: r.kind as InstagramEventKind, at: r.at.toISOString() }));
}

// ---- an employee's own accounts ----

/** A transaction of the extended client, by the only two things asked of it (Prisma.TransactionClient is not its type). */
type Tx = { $queryRaw: typeof prisma.$queryRaw; $executeRaw: typeof prisma.$executeRaw };

/** Why an employee cannot change their accounts now, in words, or null when they can. */
function closedWords(s: InstagramSettingsView, now = Date.now()): string | null {
  if (instagramTaskRunning(s, now)) return null;
  if (!s.enabled) return "The Instagram task is closed: accounts can't be changed now.";
  if (s.startsAt && now < Date.parse(s.startsAt)) return `The Instagram task starts on ${dayWords(istDate(s.startsAt))}.`;
  return `The Instagram task ended on ${dayWords(istLastDay(s.endsAt!))}: accounts can't be changed now.`;
}
const dayWords = (day: string) =>
  new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

async function hasPrize(tx: Tx, employeeId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ one: number }[]>`SELECT 1 AS one FROM "InstagramPrize" WHERE "employeeId" = ${employeeId}`;
  return rows.length > 0;
}

async function logEvent(
  tx: Tx,
  e: { accountId: string | null; employeeId: string; handle: string; kind: InstagramEventKind; posts?: number | null; followers?: number | null; note?: string | null; by: InstagramActor },
) {
  await tx.$executeRaw`
    INSERT INTO "InstagramAccountEvent" ("id", "accountId", "employeeId", "handle", "kind", "posts", "followers", "note", "byName", "byId", "at")
    VALUES (${crypto.randomUUID()}, ${e.accountId}, ${e.employeeId}, ${e.handle}, ${e.kind}, ${e.posts ?? null}, ${e.followers ?? null},
            ${e.note ?? null}, ${e.by.name}, ${e.by.kind === "employee" ? e.by.id : null}, ${NOW})`;
}

/** Runs a change to one employee's accounts under their lock, after the checks every change to them shares. */
async function asOwner<T>(actor: EmployeeActor, run: (tx: Tx, settings: InstagramSettingsView) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(personLock(actor.id));
      const settings = toSettings(await tx.$queryRaw<SettingsRow[]>(SETTINGS_SQL));
      const closed = closedWords(settings);
      if (closed) throw new InstagramTaskError(409, closed);
      if (await hasPrize(tx, actor.id)) throw new InstagramTaskError(409, "Your prize has been given, so your accounts are final.");
      return run(tx, settings);
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new InstagramTaskError(409, "That account was added to the task a moment ago by someone else.");
    throw e;
  }
}

async function ownAccount(tx: Tx, actor: EmployeeActor, accountId: string): Promise<AccountRow> {
  const rows = await tx.$queryRaw<AccountRow[]>`SELECT ${ACCOUNT_COLS} FROM "InstagramAccount" WHERE "id" = ${accountId}`;
  // Someone else's account answers exactly as a missing one: a staff page never learns another person's account ids.
  if (!rows[0] || rows[0].employeeId !== actor.id) throw new InstagramTaskError(404, "That account isn't one of yours.");
  return rows[0];
}

async function handleFree(tx: Tx, actor: EmployeeActor, handle: string) {
  const taken = await tx.$queryRaw<{ employeeId: string }[]>`SELECT "employeeId" FROM "InstagramAccount" WHERE "handle" = ${handle}`;
  if (taken[0]) {
    throw new InstagramTaskError(409, taken[0].employeeId === actor.id ? `@${handle} is already one of your accounts.` : `@${handle} is already in the task: someone else added it.`);
  }
}

/** Adds one of their accounts, with what it shows now. */
export async function addInstagramAccount(actor: EmployeeActor, input: { handle: string; posts: number; followers: number }): Promise<{ id: string }> {
  return asOwner(actor, async (tx, settings) => {
    const [{ n }] = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "InstagramAccount" WHERE "employeeId" = ${actor.id}`;
    if (n >= settings.accountsPerPerson) {
      throw new InstagramTaskError(409, `You already have your ${settings.accountsPerPerson} accounts. Remove one to add another.`);
    }
    await handleFree(tx, actor, input.handle);
    const id = crypto.randomUUID();
    await tx.$executeRaw`
      INSERT INTO "InstagramAccount" ("id", "employeeId", "handle", "posts", "followers", "reportedAt", "createdAt")
      VALUES (${id}, ${actor.id}, ${input.handle}, ${input.posts}, ${input.followers}, ${NOW}, ${NOW})`;
    await logEvent(tx, { accountId: id, employeeId: actor.id, handle: input.handle, kind: "ADDED", posts: input.posts, followers: input.followers, by: actor });
    return { id };
  });
}

/** What one of their accounts shows now. The same numbers again change nothing, so nothing waits for a check. */
export async function reportInstagramAccount(actor: EmployeeActor, accountId: string, counts: { posts: number; followers: number }): Promise<{ changed: boolean }> {
  return asOwner(actor, async (tx) => {
    const a = await ownAccount(tx, actor, accountId);
    if (a.posts === counts.posts && a.followers === counts.followers) return { changed: false };
    await tx.$executeRaw`
      UPDATE "InstagramAccount" SET "posts" = ${counts.posts}, "followers" = ${counts.followers}, "reportedAt" = ${NOW}
      WHERE "id" = ${accountId}`;
    await logEvent(tx, { accountId, employeeId: actor.id, handle: a.handle, kind: "REPORTED", posts: counts.posts, followers: counts.followers, by: actor });
    return { changed: true };
  });
}

/**
 * A new username for one of their accounts (Instagram lets its owner change it). Its check goes: what was checked was
 * looked at under the old name, so it is checked again under the new one before it counts.
 */
export async function renameInstagramAccount(actor: EmployeeActor, accountId: string, handle: string): Promise<{ changed: boolean }> {
  return asOwner(actor, async (tx) => {
    const a = await ownAccount(tx, actor, accountId);
    if (a.handle === handle) return { changed: false };
    await handleFree(tx, actor, handle);
    await tx.$executeRaw`
      UPDATE "InstagramAccount"
      SET "handle" = ${handle}, "checkState" = NULL, "checkedPosts" = NULL, "checkedFollowers" = NULL, "checkNote" = NULL,
          "checkedBy" = NULL, "checkedAt" = NULL
      WHERE "id" = ${accountId}`;
    await logEvent(tx, { accountId, employeeId: actor.id, handle, kind: "RENAMED", note: a.handle, by: actor });
    return { changed: true };
  });
}

/** Takes one of their accounts out of the task. Its history stays, under its username. */
export async function removeInstagramAccount(actor: EmployeeActor, accountId: string): Promise<void> {
  await asOwner(actor, async (tx) => {
    const a = await ownAccount(tx, actor, accountId);
    await logEvent(tx, { accountId: null, employeeId: actor.id, handle: a.handle, kind: "REMOVED", posts: a.posts, followers: a.followers, by: actor });
    await tx.$executeRaw`DELETE FROM "InstagramAccount" WHERE "id" = ${accountId}`;
  });
}

// ---- checks ----

export type CheckDecision = { state: Extract<CheckState, "checked">; posts: number; followers: number } | { state: Extract<CheckState, "rejected">; note: string };

/**
 * What a tracker or an admin saw on Instagram: the account's posts and followers, or that it does not count, and why.
 * Open whether or not the task is running (the last checks come after its last day), never on a tracker's own
 * accounts, never once its owner's prize is given.
 */
export async function checkInstagramAccount(checker: InstagramActor, accountId: string, decision: CheckDecision): Promise<void> {
  if (checker.kind === "employee" && !checker.tracker) throw new InstagramTaskError(403, "Only HR and the admins check accounts.");
  const found = await prisma.$queryRaw<{ employeeId: string }[]>`SELECT "employeeId" FROM "InstagramAccount" WHERE "id" = ${accountId}`;
  if (!found[0]) throw new InstagramTaskError(404, "That account is no longer in the task.");
  const owner = found[0].employeeId;
  if (checker.kind === "employee" && checker.id === owner) {
    throw new InstagramTaskError(403, "Your own accounts are checked by an admin or another tracker, not by you.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(personLock(owner));
    const rows = await tx.$queryRaw<AccountRow[]>`SELECT ${ACCOUNT_COLS} FROM "InstagramAccount" WHERE "id" = ${accountId}`;
    const a = rows[0];
    if (!a) throw new InstagramTaskError(404, "That account is no longer in the task.");
    if (await hasPrize(tx, owner)) throw new InstagramTaskError(409, "Their prize has been given, so their accounts are final.");
    if (decision.state === "checked") {
      await tx.$executeRaw`
        UPDATE "InstagramAccount"
        SET "checkState" = 'checked', "checkedPosts" = ${decision.posts}, "checkedFollowers" = ${decision.followers}, "checkNote" = NULL,
            "checkedBy" = ${checker.name}, "checkedAt" = ${NOW}
        WHERE "id" = ${accountId}`;
      await logEvent(tx, { accountId, employeeId: owner, handle: a.handle, kind: "CHECKED", posts: decision.posts, followers: decision.followers, by: checker });
    } else {
      await tx.$executeRaw`
        UPDATE "InstagramAccount"
        SET "checkState" = 'rejected', "checkedPosts" = NULL, "checkedFollowers" = NULL, "checkNote" = ${decision.note},
            "checkedBy" = ${checker.name}, "checkedAt" = ${NOW}
        WHERE "id" = ${accountId}`;
      await logEvent(tx, { accountId, employeeId: owner, handle: a.handle, kind: "REJECTED", note: decision.note, by: checker });
    }
  });
}

// ---- the admin's ----

export interface InstagramSettingsInput {
  enabled: boolean;
  accountsPerPerson: number;
  postsPerAccount: number;
  followersPerAccount: number;
  prizeRupees: number;
  startsAt: Date | null;
  endsAt: Date | null;
}

export async function saveInstagramSettings(input: InstagramSettingsInput, by: string): Promise<InstagramSettingsView> {
  const startsAt = input.startsAt ? input.startsAt.toISOString() : null;
  const endsAt = input.endsAt ? input.endsAt.toISOString() : null;
  await prisma.$executeRaw`
    INSERT INTO "InstagramTaskSettings" ("id", "enabled", "accountsPerPerson", "postsPerAccount", "followersPerAccount", "prizeRupees", "startsAt", "endsAt", "changedBy", "updatedAt")
    VALUES (${SETTINGS_ID}, ${input.enabled}, ${input.accountsPerPerson}, ${input.postsPerAccount}, ${input.followersPerAccount}, ${input.prizeRupees},
            (${startsAt}::timestamptz AT TIME ZONE 'UTC'), (${endsAt}::timestamptz AT TIME ZONE 'UTC'), ${by}, ${NOW})
    ON CONFLICT ("id") DO UPDATE SET
      "enabled" = EXCLUDED."enabled", "accountsPerPerson" = EXCLUDED."accountsPerPerson", "postsPerAccount" = EXCLUDED."postsPerAccount",
      "followersPerAccount" = EXCLUDED."followersPerAccount", "prizeRupees" = EXCLUDED."prizeRupees", "startsAt" = EXCLUDED."startsAt",
      "endsAt" = EXCLUDED."endsAt", "changedBy" = EXCLUDED."changedBy", "updatedAt" = EXCLUDED."updatedAt"`;
  return instagramSettings();
}

/** Makes an employee a tracker (HR), or no longer one. Only someone still here can be made one. */
export async function setInstagramTracker(employeeId: string, tracker: boolean, by: string): Promise<void> {
  if (!tracker) {
    await prisma.$executeRaw`DELETE FROM "InstagramTracker" WHERE "employeeId" = ${employeeId}`;
    return;
  }
  const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { isActive: true } });
  if (!e) throw new InstagramTaskError(404, "There is no such employee.");
  if (!e.isActive) throw new InstagramTaskError(409, "That employee's account is switched off.");
  await prisma.$executeRaw`
    INSERT INTO "InstagramTracker" ("employeeId", "addedBy", "addedAt") VALUES (${employeeId}, ${by}, ${NOW})
    ON CONFLICT ("employeeId") DO NOTHING`;
}

/**
 * Records the prize as given to someone whose every account is checked done, at today's amount. Once each; their
 * accounts are final from then on. The server works out "complete" again here, under their lock, from what is stored.
 */
export async function giveInstagramPrize(employeeId: string, note: string | null, by: string): Promise<InstagramPrizeView> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(personLock(employeeId));
    if (await hasPrize(tx, employeeId)) throw new InstagramTaskError(409, "Their prize has already been given.");
    const settings = toSettings(await tx.$queryRaw<SettingsRow[]>(SETTINGS_SQL));
    const accounts = (await tx.$queryRaw<AccountRow[]>`SELECT ${ACCOUNT_COLS} FROM "InstagramAccount" WHERE "employeeId" = ${employeeId}`).map(toAccount);
    const p = personProgress(accounts, settings);
    if (!p.complete) {
      throw new InstagramTaskError(409, `Not complete yet: ${p.done} of ${settings.accountsPerPerson} accounts are checked done.`);
    }
    const rows = await tx.$queryRaw<PrizeRow[]>`
      INSERT INTO "InstagramPrize" ("employeeId", "amount", "note", "givenBy", "givenAt")
      VALUES (${employeeId}, ${settings.prizeRupees}, ${note}, ${by}, ${NOW})
      RETURNING *`;
    return toPrize(rows[0]);
  });
}
