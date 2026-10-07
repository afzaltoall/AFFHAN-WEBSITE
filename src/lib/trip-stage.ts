import { prisma } from "@/lib/prisma";

/**
 * How far the Free China Business Trip has got, as the team sets it in the
 * console (the owner's choice of 2026-10-07: the team moves it, so it is
 * never ahead of what has happened). The participants page's "What happens
 * next" follows it (NextSteps), read with the board every few seconds.
 *
 * The stages are the Terms' own steps after applying (sections 1, 3 and 4):
 * applications open, then the eligibility check, the random draw, the
 * winners announced, and the trip date shared with the winners.
 *
 * Read and written in plain SQL, so it works with whichever Prisma client is
 * running (a dev server started before the TripStage model was added has one
 * without it), and so a database that has not had the table added yet reads
 * as "open", the stage before anything has happened, rather than failing.
 * Its time is written in UTC, as Prisma writes a DateTime (a plain now() would
 * take the database session's own time zone).
 */
export const TRIP_STAGES = ["open", "checking", "drawing", "announced", "dates"] as const;
export type TripStageName = (typeof TRIP_STAGES)[number];

export interface TripStageState {
  stage: TripStageName;
  changedBy: string | null;
  changedAt: string | null;
}

const ID = "trip";
const isStage = (v: unknown): v is TripStageName => typeof v === "string" && (TRIP_STAGES as readonly string[]).includes(v);

export async function tripStage(): Promise<TripStageState> {
  try {
    const rows = await prisma.$queryRaw<{ stage: string; changedBy: string | null; updatedAt: Date }[]>`
      SELECT "stage", "changedBy", "updatedAt" FROM "TripStage" WHERE "id" = ${ID} LIMIT 1`;
    const row = rows[0];
    return { stage: isStage(row?.stage) ? row.stage : "open", changedBy: row?.changedBy ?? null, changedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null };
  } catch {
    return { stage: "open", changedBy: null, changedAt: null };
  }
}

export async function setTripStage(stage: TripStageName, by: string): Promise<TripStageState> {
  await prisma.$executeRaw`
    INSERT INTO "TripStage" ("id", "stage", "changedBy", "updatedAt") VALUES (${ID}, ${stage}, ${by}, now() AT TIME ZONE 'UTC')
    ON CONFLICT ("id") DO UPDATE SET "stage" = EXCLUDED."stage", "changedBy" = EXCLUDED."changedBy", "updatedAt" = now() AT TIME ZONE 'UTC'`;
  return tripStage();
}

export const asTripStage = (v: unknown): TripStageName | null => (isStage(v) ? v : null);
