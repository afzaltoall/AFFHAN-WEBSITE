import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { LOCKOUT_MEMORY_MS, lockedUntil } from "@/lib/login-lockout";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };
const FILTERS = ["all", "active", "blocked", "locked", "none"] as const;
type Filter = (typeof FILTERS)[number];
/** The supplier door's prefix on LoginAttempt (supplierLoginKey in lib/password.ts). */
const KEY = "supplier:";

/**
 * Supplier Users: the console's Users section lists supplier accounts beside the customers' (the owner,
 * 2026-10-23). Accounts, not applications (New Suppliers has those): how they sign in, whether they can, and
 * when they last did. Admins only, never cached.
 *
 * ?page, ?limit (at most 50), ?search (name, company, email or mobile), ?filter: all | active | blocked |
 * locked (locked out by wrong passwords now, lib/login-lockout.ts) | none (nothing applied for yet). Ordered as
 * the customer lists are: the last to sign in first.
 */
export async function GET(request: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE });

  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(params.get("limit") ?? "20", 10) || 20));
  const search = (params.get("search") ?? "").trim().slice(0, 100);
  const asked = params.get("filter") ?? "all";
  const filter: Filter = (FILTERS as readonly string[]).includes(asked) ? (asked as Filter) : "all";

  try {
    // Failed sign-ins the lockout still remembers, by account address: who is locked out now, and how many.
    const now = Date.now();
    const attempts = await prisma.loginAttempt.findMany({
      where: { email: { startsWith: KEY }, createdAt: { gte: new Date(now - LOCKOUT_MEMORY_MS) } },
      orderBy: { createdAt: "asc" },
      select: { email: true, createdAt: true },
      take: 50_000,
    });
    const failures = new Map<string, number[]>();
    for (const a of attempts) {
      const address = a.email.slice(KEY.length);
      const list = failures.get(address) ?? [];
      list.push(a.createdAt.getTime());
      failures.set(address, list);
    }
    const lockedAddresses = [...failures].filter(([, times]) => lockedUntil(times, now) !== null).map(([address]) => address);

    const digits = search.replace(/[\s()-]/g, "");
    const searched: Prisma.SupplierAccountWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { companyName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            ...(digits ? [{ mobile: { contains: digits } }] : []),
          ],
        }
      : {};
    const narrowed: Record<Filter, Prisma.SupplierAccountWhereInput> = {
      all: {},
      active: { status: "ACTIVE" },
      blocked: { status: "BLOCKED" },
      locked: { email: { in: lockedAddresses } },
      none: { offers: { none: {} } },
    };
    const where: Prisma.SupplierAccountWhereInput = { AND: [searched, narrowed[filter]] };

    const [total, accounts, ...counted] = await Promise.all([
      prisma.supplierAccount.count({ where }),
      prisma.supplierAccount.findMany({
        where,
        orderBy: [{ lastLoginAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, name: true, email: true, mobile: true, companyName: true, status: true, lastLoginAt: true, createdAt: true,
          _count: { select: { offers: true } },
        },
      }),
      ...FILTERS.map((f) => prisma.supplierAccount.count({ where: { AND: [searched, narrowed[f]] } })),
    ]);

    const ids = accounts.map((a) => a.id);
    const emails = accounts.map((a) => a.email);
    const [waiting, checked] = await Promise.all([
      prisma.supplierOffer.groupBy({ by: ["supplierId"], where: { supplierId: { in: ids }, status: "NEW" }, _count: { _all: true } }),
      // An address proved at sign-up: a sign-up code for it that was accepted (lib/email-otp.ts, SUPPLIER_SIGNUP).
      prisma.emailOtp.findMany({ where: { email: { in: emails }, purpose: "SUPPLIER_SIGNUP", consumedAt: { not: null } }, select: { email: true } }),
    ]);
    const waitingBy = new Map(waiting.map((w) => [w.supplierId, w._count._all]));
    const checkedSet = new Set(checked.map((c) => c.email));

    const data = accounts.map((a) => {
      const times = failures.get(a.email) ?? [];
      const until = lockedUntil(times, now);
      return {
        id: a.id,
        name: a.name,
        email: a.email,
        mobile: a.mobile,
        companyName: a.companyName,
        status: a.status === "BLOCKED" ? "BLOCKED" : "ACTIVE",
        lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
        applications: a._count.offers,
        waiting: waitingBy.get(a.id) ?? 0,
        emailChecked: checkedSet.has(a.email),
        failedSignIns: times.length,
        lockedUntil: until ? new Date(until).toISOString() : null,
      };
    });

    return NextResponse.json(
      {
        data,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        counts: Object.fromEntries(FILTERS.map((f, i) => [f, counted[i]])),
      },
      { headers: PRIVATE },
    );
  } catch (error) {
    console.error("supplier accounts list failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Could not load the supplier accounts." }, { status: 500, headers: PRIVATE });
  }
}
