import { prisma } from "@/lib/prisma";
import { COUNTRIES } from "@/lib/countries";

/**
 * A participant's own registration for the Free China Business Trip, as its
 * owner sees it (the boarding pass on /free-china-trip/registered/), found by
 * the signed-in account or by the browser that sent it (lib/trip-applicant.ts).
 *
 * Nothing about anyone else leaves here: no count, no list, no country tally.
 * The board showed those to everyone until the owner took them off it
 * (2026-10-28: "dont show the current trip of counts, remove this completely
 * for user view"); the team sees every application in the console.
 */

const ISO_OF = new Map(COUNTRIES.map((c) => [c.name, c.iso]));
const isoOf = (country: string) => ISO_OF.get(country) ?? null;

/** One registration, as its owner sees it. */
export interface OwnRegistration {
  referenceNo: string;
  createdAt: string;
  fullName: string;
  firstName: string;
  country: string;
  iso: string | null;
  city: string;
  businessStatus: string;
}

const OWN = { referenceNo: true, createdAt: true, fullName: true, country: true, city: true, businessStatus: true } as const;

function own(row: { referenceNo: string; createdAt: Date; fullName: string; country: string; city: string; businessStatus: string }): OwnRegistration {
  return {
    referenceNo: row.referenceNo,
    createdAt: row.createdAt.toISOString(),
    fullName: row.fullName,
    firstName: row.fullName.trim().split(/\s+/)[0] ?? row.fullName,
    country: row.country,
    iso: isoOf(row.country),
    city: row.city,
    businessStatus: row.businessStatus,
  };
}

/** The account's application (not one the team deleted), or null. */
export async function registrationOf(userId: string): Promise<OwnRegistration | null> {
  const row = await prisma.tripApplication.findFirst({
    where: { userId, status: { not: "deleted" } },
    orderBy: { createdAt: "asc" },
    select: OWN,
  });
  return row ? own(row) : null;
}

/** The application a browser sent (its id, from the applicant cookie), unless the team deleted it; or null. */
export async function registrationById(id: string | null): Promise<OwnRegistration | null> {
  if (!id) return null;
  const row = await prisma.tripApplication.findFirst({ where: { id, status: { not: "deleted" } }, select: OWN });
  return row ? own(row) : null;
}
