import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma, withDbRetry } from "@/lib/prisma";

/**
 * Free China Trip applications as the console reads them, for its list
 * (/api/admin/trip-applications/) and its "Registered again"
 * (/api/admin/trip-applications/repeats/), so the two never disagree about
 * what a row carries: every answer, the account that sent it (never the
 * password hash or the Google id), dates as text, and the customer's number
 * (AFFHAN-0001, CustomerCode).
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

type AdminApplicationRow = Prisma.TripApplicationGetPayload<{ include: typeof ADMIN_APPLICATION_INCLUDE }>;

export async function forConsole(rows: AdminApplicationRow[]) {
  const keys = [...new Set(rows.map((r) => r.customerKey).filter((k): k is string => !!k))];
  const codes = keys.length
    ? await withDbRetry(() => prisma.customerCode.findMany({ where: { customerKey: { in: keys } }, select: { customerKey: true, code: true } }))
    : [];
  const codeOf = new Map(codes.map((c) => [c.customerKey, c.code]));
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
