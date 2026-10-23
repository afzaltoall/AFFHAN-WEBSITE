import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isOfferStatus } from "@/lib/supplier-offer";
import { supplierLoginKey } from "@/lib/password";
import { LOCKOUT_MEMORY_MS, lockedUntil } from "@/lib/login-lockout";
import { ACCOUNT_SELECT, OFFER_INCLUDE, toBoardAccount, toBoardOffer } from "@/lib/server/new-supplier-rows";
import { NewSupplierDetail, type OtherApplication, type SupplierSignIn } from "@/components/admin/NewSupplierDetail";

/** Where the page was opened from: New Suppliers (the sourcing side) or Supplier Users (the accounts side). */
export type SupplierPageFrom = "new-suppliers" | "users";

const BACK: Record<SupplierPageFrom, { href: string; label: string }> = {
  "new-suppliers": { href: "/admin/new-suppliers/", label: "New Suppliers" },
  users: { href: "/admin/users/suppliers/", label: "Supplier Users" },
};

/** Other new suppliers' applications for a product this one applied for, newest first. */
const OTHERS = 12;

/**
 * One new supplier's page, for both of its addresses: /admin/new-suppliers/<id>/ and /admin/users/suppliers/<id>/
 * (2026-10-23). The same page; where it was opened from decides only the way back and the row the rail lights.
 * The caller has checked that the reader is an admin: this reads.
 */
export async function renderNewSupplierPage(id: string, from: SupplierPageFrom) {
  const account = await prisma.supplierAccount.findUnique({ where: { id }, select: ACCOUNT_SELECT });
  if (!account) notFound();

  const now = Date.now();
  const [offers, serial, failures, lastReset, signupCheck] = await Promise.all([
    prisma.supplierOffer.findMany({ where: { supplierId: id }, orderBy: { createdAt: "desc" }, include: OFFER_INCLUDE }),
    // Their S.No on New Suppliers, which numbers suppliers in the order they registered.
    prisma.supplierAccount.count({ where: { createdAt: { lte: account.createdAt } } }),
    // Wrong passwords the lockout still remembers, under the supplier door's own key (lib/login-lockout.ts).
    prisma.loginAttempt.findMany({
      where: { email: supplierLoginKey(account.email), createdAt: { gte: new Date(now - LOCKOUT_MEMORY_MS) } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
      take: 1000,
    }),
    prisma.emailOtp.findFirst({ where: { email: account.email, purpose: "SUPPLIER_PASSWORD_RESET" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    // Proved at sign-up: the sign-up code for this address, accepted (accounts made before 2026-10-23 were not asked).
    prisma.emailOtp.findFirst({
      where: { email: account.email, purpose: "SUPPLIER_SIGNUP", consumedAt: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { consumedAt: true },
    }),
  ]);
  const until = lockedUntil(failures.map((f) => f.createdAt.getTime()), now);
  const signIn: SupplierSignIn = {
    failedSignIns: failures.length,
    lockedUntil: until ? new Date(until).toISOString() : null,
    lastResetAskedAt: lastReset?.createdAt.toISOString() ?? null,
    emailCheckedAt: signupCheck?.consumedAt?.toISOString() ?? null,
  };

  // "Who else offered this", as the book's page asks, and as the inquiries' matching reads "the same product": the
  // same catalogue product, or the same name (a supplier's own product named as a catalogue one is that product).
  const productIds = [...new Set(offers.flatMap((o) => (o.productId === null ? [] : [o.productId])))];
  const names = [...new Set(offers.map((o) => o.productName))];
  const same = [
    ...(productIds.length ? [{ productId: { in: productIds } }] : []),
    ...(names.length ? [{ productName: { in: names, mode: "insensitive" as const } }] : []),
  ];
  const otherRows = same.length
    ? await prisma.supplierOffer.findMany({
        where: { supplierId: { not: id }, OR: same },
        orderBy: { createdAt: "desc" },
        take: OTHERS,
        select: { id: true, productName: true, status: true, supplier: { select: { id: true, name: true, companyName: true } } },
      })
    : [];
  const others: OtherApplication[] = otherRows.map((o) => ({
    offerId: o.id,
    supplierId: o.supplier.id,
    title: o.supplier.companyName ?? o.supplier.name,
    person: o.supplier.companyName ? o.supplier.name : "",
    productName: o.productName,
    status: isOfferStatus(o.status) ? o.status : "NEW",
  }));

  return (
    <NewSupplierDetail
      account={toBoardAccount(account)}
      serial={serial}
      offers={offers.map(toBoardOffer)}
      others={others}
      signIn={signIn}
      back={BACK[from]}
    />
  );
}

/** The tab's title: the supplier's own name. The caller has checked that the reader is an admin. */
export async function newSupplierTitle(id: string): Promise<string> {
  const row = await prisma.supplierAccount.findUnique({ where: { id }, select: { name: true, companyName: true } });
  return row ? `${row.companyName ?? row.name} | Affhan New Suppliers` : "Supplier not found | Affhan Admin";
}
