import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentSupplier } from "@/lib/supplier-session";
import { isOfferStatus } from "@/lib/supplier-offer";
import { SupplierApplications, type MyOffer } from "@/components/supplier/SupplierApplications";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "My applications" };

/** Everything the supplier has applied for, newest first, with where each one stands and the team's reply. */
export default async function SupplierApplicationsPage() {
  const supplier = await currentSupplier();
  if (!supplier) redirect("/supplier/login/");

  const rows = await prisma.supplierOffer.findMany({
    where: { supplierId: supplier.id },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: {
      id: true,
      productId: true,
      productName: true,
      productImage: true,
      categoryName: true,
      moq: true,
      moqUnit: true,
      details: true,
      photos: true,
      contactName: true,
      companyName: true,
      mobile: true,
      wechatId: true,
      companyAddress: true,
      status: true,
      reply: true,
      reviewedAt: true,
      createdAt: true,
    },
  });

  const offers: MyOffer[] = rows.map((r) => ({
    ...r,
    status: isOfferStatus(r.status) ? r.status : "NEW",
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return <SupplierApplications offers={offers} />;
}
