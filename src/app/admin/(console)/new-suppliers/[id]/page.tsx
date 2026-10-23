import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { NewSupplierDetail, type OtherApplication } from "@/components/admin/NewSupplierDetail";
import { isOfferStatus } from "@/lib/supplier-offer";
import { ACCOUNT_SELECT, OFFER_INCLUDE, toBoardAccount, toBoardOffer } from "@/lib/server/new-supplier-rows";

export const dynamic = "force-dynamic";

/**
 * The supplier's own name in the tab title, as Old Suppliers' pages have it: several are open at once while the
 * team chases them. The admin check is repeated here because generateMetadata runs apart from the page, and
 * without it an unsigned request would be handed the supplier's name in <title>.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const robots = { index: false, follow: false };
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return { title: "Affhan Admin", robots };

  const { id } = await params;
  const row = await prisma.supplierAccount.findUnique({ where: { id }, select: { name: true, companyName: true } });
  if (!row) return { title: "Supplier not found | Affhan Admin", robots };
  return { title: `${row.companyName ?? row.name} | Affhan New Suppliers`, robots };
}

/** Other new suppliers' applications for a product this one applied for, newest first. */
const OTHERS = 12;

export default async function NewSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  const { id } = await params;
  const account = await prisma.supplierAccount.findUnique({ where: { id }, select: ACCOUNT_SELECT });
  if (!account) notFound();

  const [offers, serial] = await Promise.all([
    prisma.supplierOffer.findMany({ where: { supplierId: id }, orderBy: { createdAt: "desc" }, include: OFFER_INCLUDE }),
    // Their S.No on New Suppliers, which numbers suppliers in the order they registered.
    prisma.supplierAccount.count({ where: { createdAt: { lte: account.createdAt } } }),
  ]);

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

  return <NewSupplierDetail account={toBoardAccount(account)} serial={serial} offers={offers.map(toBoardOffer)} others={others} />;
}
