import "server-only";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applicationWindow } from "@/lib/trip-application";
import {
  DRAW_SEATS,
  compareTripIds,
  personName,
  seatDraws,
  type DrawBoard,
  type DrawCardFull,
  type DrawCardPublic,
  type DrawMode,
  type DrawPool,
} from "@/lib/lucky-draw-shared";

/**
 * The Free China Trip's lucky draw (the owner, 2026-11-10; lib/lucky-draw-shared.ts has the seats). Every draw is a row
 * of TripDraw, read and written in plain SQL as TripStage is: a database without the table yet (its migration not
 * applied) reads as no draws, with `ready` false, rather than failing.
 *
 * Who is in the draw (the owner, 2026-11-10: "Only those with a valid passport"): applications that said yes to "Do you
 * have a valid passport?", not marked spam or deleted, one chance per person (one per mobile number: someone who
 * applied twice, through "Registered again", is in once, by their first application), and not already drawn in this
 * mode. An employee's link changes nothing (Terms clause 3).
 *
 * How one is drawn: in one transaction holding the draw's own lock (two presses at once are drawn one after the
 * other, never the same person twice), everyone in the draw is read and put in Trip ID order, one is chosen with the
 * operating system's cryptographic random numbers (crypto.randomInt: every one equally likely, Terms clause 3), and
 * the row records who, how many were in the draw and a fingerprint of exactly who they were (sha256 of their Trip IDs
 * in order), so the draw can be shown to be what it says.
 */

/** Not drawn yet in `mode`: neither this application nor another from the same mobile number. */
const notDrawn = (mode: DrawMode) => Prisma.sql`
    AND NOT EXISTS (
      SELECT 1 FROM "TripDraw" d JOIN "TripApplication" b ON b."id" = d."applicationId"
      WHERE d."mode" = ${mode}
        AND (b."id" = a."id" OR (a."customerKey" IS NOT NULL AND b."customerKey" = a."customerKey"))
    )`;

/**
 * Everyone in the draw in `mode`, now: one row a person. `drawn` false leaves out the check against earlier draws, for
 * a database without the draw's table yet, where nobody can have been drawn.
 */
const pool = (mode: DrawMode, drawn = true) => Prisma.sql`
  SELECT DISTINCT ON (COALESCE(a."customerKey", a."id")) a."id", a."referenceNo", a."fullName", a."city", a."country"
  FROM "TripApplication" a
  WHERE a."status" NOT IN ('spam', 'deleted')
    AND a."hasPassport" = true${drawn ? notDrawn(mode) : Prisma.empty}
  ORDER BY COALESCE(a."customerKey", a."id"), a."createdAt", a."id"`;

interface PoolRow {
  id: string;
  referenceNo: string;
  fullName: string;
  city: string;
  country: string;
}

/** Trip ID order, the order the draw is made in and the list is shown in (Trip IDs are unique; the id never decides). */
const byTripId = (a: PoolRow, b: PoolRow) => compareTripIds(a.referenceNo, b.referenceNo) || compareTripIds(a.id, b.id);

/** The table is not there yet: its migration has not been applied to this database. */
function isMissingTable(e: unknown): boolean {
  const text = e instanceof Error ? e.message : String(e);
  return /relation "TripDraw" does not exist|42P01/.test(text);
}

interface Row {
  id: string;
  number: number;
  applicationId: string;
  drawnAt: Date;
  drawnBy: string;
  poolSize: number;
  poolHash: string;
  releasedAt: Date | null;
  releasedBy: string | null;
  releaseNote: string | null;
  referenceNo: string;
  fullName: string;
  phone: string;
  city: string;
  country: string;
  status: string;
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
const removed = (status: string) => status === "spam" || status === "deleted";

export async function drawBoard(mode: DrawMode, full: true): Promise<DrawBoard<DrawCardFull>>;
export async function drawBoard(mode: DrawMode, full: false): Promise<DrawBoard<DrawCardPublic>>;
/**
 * The board in `mode`: every draw in order, the seats and rounds worked out from them (seatDraws), who can still be
 * drawn, and the one the screen shows large. `full` for the console (a mobile number to call, who drew, the
 * fingerprint, who released and why); otherwise only what the TV screen may show.
 */
export async function drawBoard(mode: DrawMode, full: boolean): Promise<DrawBoard<DrawCardFull> | DrawBoard<DrawCardPublic>> {
  const applicationsOpen = applicationWindow() !== "closed";
  let rows: Row[];
  let poolSize: number;
  try {
    [rows, poolSize] = await Promise.all([
      prisma.$queryRaw<Row[]>`
        SELECT d."id", d."number", d."applicationId", d."drawnAt", d."drawnBy", d."poolSize", d."poolHash",
               d."releasedAt", d."releasedBy", d."releaseNote",
               a."referenceNo", a."fullName", a."phone", a."city", a."country", a."status"
        FROM "TripDraw" d JOIN "TripApplication" a ON a."id" = d."applicationId"
        WHERE d."mode" = ${mode}
        ORDER BY d."number"`,
      prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM (${pool(mode)}) p`.then((r) => r[0]?.n ?? 0),
    ]);
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    // Nobody can have been drawn without the table: everyone in the draw, counted as the pool counts them.
    const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM (${pool(mode, false)}) p`;
    const open = Array.from({ length: DRAW_SEATS }, () => null);
    return { mode, poolSize: n, cards: [], seats: open, round: 1, rounds: [open], latest: null, applicationsOpen, ready: false };
  }
  const seating = seatDraws(rows.map((r) => ({ id: r.id, number: r.number, drawnAt: iso(r.drawnAt)!, releasedAt: iso(r.releasedAt), removed: removed(r.status) })));
  const out = new Set(seating.out);
  const cards = rows.map((r): DrawCardFull => ({
    id: r.id,
    number: r.number,
    tripId: r.referenceNo,
    name: personName(r.fullName),
    city: personName(r.city),
    country: r.country,
    drawnAt: iso(r.drawnAt)!,
    poolSize: r.poolSize,
    round: seating.roundOf[r.id] ?? 1,
    seat: seating.seatOf[r.id] ?? null,
    out: out.has(r.id),
    applicationId: r.applicationId,
    phone: r.phone,
    drawnBy: r.drawnBy,
    poolHash: r.poolHash,
    releasedAt: iso(r.releasedAt),
    releasedBy: r.releasedBy,
    releaseNote: r.releaseNote,
    status: r.status,
  }));
  const last = cards.at(-1);
  const board = {
    mode,
    poolSize,
    seats: seating.rounds[seating.rounds.length - 1],
    round: seating.rounds.length,
    rounds: seating.rounds,
    latest: last && last.seat !== null ? last.id : null,
    applicationsOpen,
    ready: true,
  };
  if (full) return { ...board, cards };
  return {
    ...board,
    cards: cards.map(
      ({ id, number, tripId, name, city, country, drawnAt, poolSize: size, round, seat, out: gone }): DrawCardPublic => ({
        id,
        number,
        tripId,
        name,
        city,
        country,
        drawnAt,
        poolSize: size,
        round,
        seat,
        out: gone,
      }),
    ),
  };
}

/**
 * Everyone who can be drawn in `mode` now, in the order the draw puts them, for the TV screen's list (the owner,
 * 2026-11-10: the names scroll past an arrow and the draw stops on one): Trip ID, name, city and country, nothing else.
 */
export async function drawPool(mode: DrawMode): Promise<DrawPool> {
  let rows: PoolRow[];
  let ready = true;
  try {
    rows = await prisma.$queryRaw<PoolRow[]>(pool(mode));
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    ready = false;
    rows = await prisma.$queryRaw<PoolRow[]>(pool(mode, false));
  }
  rows.sort(byTripId);
  return { size: rows.length, ready, entries: rows.map((r) => [r.referenceNo, personName(r.fullName), personName(r.city), r.country]) };
}

export type DrawResult = { ok: true; id: string; again: boolean } | { ok: false; reason: "empty" | "not_ready" };

/**
 * One draw in `mode`, for the press `requestId` (the screen's own id for it): the same press sent again (its answer
 * lost on the way back) gets the draw it already made, never a second person. `by`: who pressed Draw.
 */
export async function drawOne(mode: DrawMode, requestId: string, by: string): Promise<DrawResult> {
  try {
    return await prisma.$transaction(
      async (tx): Promise<DrawResult> => {
        // One draw at a time, wherever Draw is pressed: held until this transaction ends.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext('affhan-trip-lucky-draw'))`;
        const done = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "TripDraw" WHERE "requestId" = ${requestId} LIMIT 1`;
        if (done.length) return { ok: true, id: done[0].id, again: true };
        const everyone = await tx.$queryRaw<PoolRow[]>(pool(mode));
        if (!everyone.length) return { ok: false, reason: "empty" };
        everyone.sort(byTripId);
        const poolHash = crypto.createHash("sha256").update(everyone.map((p) => p.referenceNo).join("\n")).digest("hex");
        const chosen = everyone[crypto.randomInt(everyone.length)];
        const [{ n }] = await tx.$queryRaw<{ n: number }[]>`SELECT (COALESCE(MAX("number"), 0) + 1)::int AS n FROM "TripDraw" WHERE "mode" = ${mode}`;
        const id = crypto.randomUUID();
        // The time now, after the lock (never the transaction's start, now(), which a press that waited for the lock
        // would date before the draw it waited for): draws are dated in the order they were made.
        await tx.$executeRaw`
          INSERT INTO "TripDraw" ("id", "mode", "number", "applicationId", "drawnAt", "drawnBy", "poolSize", "poolHash", "requestId")
          VALUES (${id}, ${mode}, ${n}, ${chosen.id}, clock_timestamp() AT TIME ZONE 'UTC', ${by}, ${everyone.length}, ${poolHash}, ${requestId})`;
        return { ok: true, id, again: false };
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  } catch (e) {
    if (isMissingTable(e)) return { ok: false, reason: "not_ready" };
    throw e;
  }
}

/** Someone drawn can't take part: released, with who and why. Their seat opens, and the next draw fills it first. */
export async function releaseDraw(id: string, by: string, note: string | null): Promise<boolean> {
  const n = await prisma.$executeRaw`
    UPDATE "TripDraw" SET "releasedAt" = clock_timestamp() AT TIME ZONE 'UTC', "releasedBy" = ${by}, "releaseNote" = ${note}
    WHERE "id" = ${id} AND "releasedAt" IS NULL`;
  return n > 0;
}

/** A release undone (made by mistake): as if it had never happened (seatDraws plays the draws again without it). */
export async function restoreDraw(id: string): Promise<boolean> {
  const n = await prisma.$executeRaw`
    UPDATE "TripDraw" SET "releasedAt" = NULL, "releasedBy" = NULL, "releaseNote" = NULL
    WHERE "id" = ${id} AND "releasedAt" IS NOT NULL`;
  return n > 0;
}

/** Every rehearsal draw gone, so the next rehearsal starts from seat 1. Live draws are never touched. */
export async function clearRehearsal(): Promise<number> {
  try {
    return await prisma.$executeRaw`DELETE FROM "TripDraw" WHERE "mode" = 'rehearsal'`;
  } catch (e) {
    if (isMissingTable(e)) return 0;
    throw e;
  }
}

/** The mode a draw belongs to, or null when there is no such draw. */
export async function drawModeOf(id: string): Promise<DrawMode | null> {
  try {
    const rows = await prisma.$queryRaw<{ mode: string }[]>`SELECT "mode" FROM "TripDraw" WHERE "id" = ${id} LIMIT 1`;
    const mode = rows[0]?.mode;
    return mode === "live" || mode === "rehearsal" ? mode : null;
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
}
