import { prisma } from "@/lib/prisma";
import { COUNTRIES } from "@/lib/countries";
import { tripStage, type TripStageName } from "@/lib/trip-stage";

/**
 * The Free China Business Trip's participants, as the participants board
 * (/free-china-trip/registered/) shows them, and one account's own
 * registration.
 *
 * ANONYMOUS BY DESIGN. The trip's Privacy Policy lets Affhan publish limited
 * information about the five winners, and nothing about anyone else
 * (sections 5 and 12). So the board never carries a name, an email, a phone
 * number, a city, a company or an answer: only how many have registered, and
 * for each registration its Trip ID, its country and when it arrived. The
 * signed-in visitor's own row is marked as theirs; nobody else's is told whose
 * it is.
 *
 * NOTHING HERE ORDERS APPLICANTS BY MERIT. Rows are newest first, by arrival
 * only, and no figure is a score. The winners are drawn at random from the
 * eligible applications (Terms, clause 3).
 */

/** What the board counts: everything the team has not deleted or marked as spam. */
const COUNTED = { status: { notIn: ["deleted", "spam"] } };

/** How many of the newest registrations the board lists. */
const RECENT = 30;

const ISO_OF = new Map(COUNTRIES.map((c) => [c.name, c.iso]));
const isoOf = (country: string) => ISO_OF.get(country) ?? null;

/** Midnight in India, today: "registered today" is India's day, as the trip's dates are. */
function startOfIndiaDay(now: Date) {
  const IST = 5.5 * 3600 * 1000;
  const d = new Date(now.getTime() + IST);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - IST);
}

export interface ParticipantRow {
  /** TRIP-26-00042: the Trip ID. */
  ref: string;
  country: string;
  /** Lowercase ISO alpha-2 for the flag, when the country is on the list. */
  iso: string | null;
  /** ISO timestamp of the registration. */
  at: string;
  /** The signed-in visitor's own registration. */
  you: boolean;
}

export interface ParticipantsSnapshot {
  total: number;
  today: number;
  lastHour: number;
  /** Countries represented, most registrations first. */
  countries: { country: string; iso: string | null; count: number }[];
  /** The newest registrations, newest first. */
  recent: ParticipantRow[];
  /** When this was read (ISO). */
  at: string;
  /** How far the trip has got, as the team set it (lib/trip-stage.ts): "What happens next" follows it. */
  stage: TripStageName;
}

export async function participantsSnapshot(viewerId: string | null): Promise<ParticipantsSnapshot> {
  const now = new Date();
  const [total, today, lastHour, byCountry, recent, stage] = await Promise.all([
    prisma.tripApplication.count({ where: COUNTED }),
    prisma.tripApplication.count({ where: { ...COUNTED, createdAt: { gte: startOfIndiaDay(now) } } }),
    prisma.tripApplication.count({ where: { ...COUNTED, createdAt: { gte: new Date(now.getTime() - 3600 * 1000) } } }),
    prisma.tripApplication.groupBy({ by: ["country"], where: COUNTED, _count: { _all: true } }),
    prisma.tripApplication.findMany({
      where: COUNTED,
      orderBy: { createdAt: "desc" },
      take: RECENT,
      select: { referenceNo: true, country: true, createdAt: true, userId: true },
    }),
    tripStage(),
  ]);
  return {
    total,
    today,
    lastHour,
    countries: byCountry
      .map((c) => ({ country: c.country, iso: isoOf(c.country), count: c._count._all }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country)),
    recent: recent.map((r) => ({
      ref: r.referenceNo,
      country: r.country,
      iso: isoOf(r.country),
      at: r.createdAt.toISOString(),
      you: !!viewerId && r.userId === viewerId,
    })),
    at: now.toISOString(),
    stage: stage.stage,
  };
}

/** One account's own registration, as its owner sees it. */
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

/** The account's application (not one the team deleted), or null. */
export async function registrationOf(userId: string): Promise<OwnRegistration | null> {
  const row = await prisma.tripApplication.findFirst({
    where: { userId, status: { not: "deleted" } },
    orderBy: { createdAt: "asc" },
    select: { referenceNo: true, createdAt: true, fullName: true, country: true, city: true, businessStatus: true },
  });
  if (!row) return null;
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
