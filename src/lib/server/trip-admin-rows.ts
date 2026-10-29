import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma, withDbRetry } from "@/lib/prisma";

/**
 * Free China Trip applications as the console reads them, for its list
 * (/api/admin/trip-applications/), one application's panel
 * (/api/admin/trip-applications/<id>/) and "Registered again"
 * (/api/admin/trip-applications/repeats/), so they never disagree about what
 * a row carries.
 *
 * The list carries only what its rows, search, filters and figures use
 * (LIST_SELECT, about a third of the whole: with 1,539 applications the
 * whole was 2.2 MB, 2026-10-29, the owner: "admin page loads slowly"); every
 * answer is read when one is opened, or for the Excel export (?full=1).
 */
export const ADMIN_APPLICATION_INCLUDE = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      authProvider: true,
      emailVerified: true,
      phoneVerified: true,
      profileImage: true,
      accountStatus: true,
      loginCount: true,
      lastLoginAt: true,
      createdAt: true,
    },
  },
} satisfies Prisma.TripApplicationInclude;

/** What the list shows of each application (its rows, search, filters and the figures over it). */
export const LIST_SELECT = {
  id: true,
  referenceNo: true,
  createdAt: true,
  status: true,
  fullName: true,
  email: true,
  phone: true,
  country: true,
  city: true,
  businessStatus: true,
  companyName: true,
  businessCategory: true,
  areaOfInterest: true,
  customerKey: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.TripApplicationSelect;

type AdminApplicationRow = Prisma.TripApplicationGetPayload<{ include: typeof ADMIN_APPLICATION_INCLUDE }>;
type ListRow = Prisma.TripApplicationGetPayload<{ select: typeof LIST_SELECT }>;

/** The customer numbers (AFFHAN-0001) for these keys. */
export async function codesFor(keys: Array<string | null>): Promise<Map<string, string>> {
  const wanted = [...new Set(keys.filter((k): k is string => !!k))];
  if (!wanted.length) return new Map();
  const codes = await withDbRetry(() => prisma.customerCode.findMany({ where: { customerKey: { in: wanted } }, select: { customerKey: true, code: true } }));
  return new Map(codes.map((c) => [c.customerKey, c.code]));
}

/**
 * The customer numbers of every application still counted, in one query that needs no list first, so it runs
 * alongside the list's rather than after it.
 */
export async function tripCustomerCodes(): Promise<Map<string, string>> {
  const rows = await withDbRetry(() =>
    prisma.$queryRaw<{ customerKey: string; code: string }[]>`
      SELECT c."customerKey", c.code FROM "CustomerCode" c
      WHERE c."customerKey" IN (SELECT t."customerKey" FROM "TripApplication" t WHERE t.status <> 'deleted' AND t."customerKey" IS NOT NULL)`,
  );
  return new Map(rows.map((r) => [r.customerKey, r.code]));
}

/** The list's rows: dates as text, the customer's number beside each. */
export function forList(rows: ListRow[], codeOf: Map<string, string>) {
  return rows.map(({ customerKey, ...r }) => ({ ...r, createdAt: r.createdAt.toISOString(), customerCode: customerKey ? codeOf.get(customerKey) ?? null : null }));
}

/** Applications in full: every answer, the account that sent it (never the password hash or the Google id), dates as text, the customer's number. */
export async function forConsole(rows: AdminApplicationRow[]) {
  const codeOf = await codesFor(rows.map((r) => r.customerKey));
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    customerCode: r.customerKey ? codeOf.get(r.customerKey) ?? null : null,
    user: r.user
      ? {
          ...r.user,
          createdAt: r.user.createdAt.toISOString(),
          lastLoginAt: r.user.lastLoginAt ? r.user.lastLoginAt.toISOString() : null,
        }
      : null,
  }));
}
