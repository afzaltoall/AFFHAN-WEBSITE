import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { isOfferStatus } from "@/lib/supplier-offer";
import { NewSuppliersBoard, type BoardAccount, type BoardOffer } from "@/components/admin/NewSuppliersBoard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New Suppliers | Affhan Admin",
  robots: { index: false, follow: false },
};

/**
 * The supplier portal from the team's side (2026-10-21): what suppliers have applied to supply, with their
 * MOQ, details, photos and contact, and the accounts behind them. "New" beside the WeChat book (Suppliers),
 * which holds the suppliers the team already deals with.
 *
 * Read here and handed to the board, as the supplier book's page does. The newest 2,000 of each, which is
 * years of applications at any rate a portal like this sees; the board says so if it is ever reached.
 */
export default async function NewSuppliersPage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  const data = await readBoard();
  if (!data) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] px-5 py-8 sm:px-8 lg:px-10">
        <h1 className="text-2xl font-semibold tracking-tight">New Suppliers</h1>
        <p className="mt-3 max-w-xl rounded-2xl bg-white px-5 py-4 text-[14px] text-[#48484a] shadow-sm ring-1 ring-black/[0.06]">
          The supplier portal&apos;s applications could not be read. If the portal has just been added, its database
          tables may not be created yet (prisma/migrations, supplier_portal).
        </p>
      </div>
    );
  }
  return <NewSuppliersBoard offers={data.offers} accounts={data.accounts} capped={data.capped} />;
}

/** Both lists for the board, or null when they could not be read (most likely: the migration is not applied yet). */
async function readBoard(): Promise<{ offers: BoardOffer[]; accounts: BoardAccount[]; capped: boolean } | null> {
  try {
    const [offers, accounts] = await Promise.all([
      prisma.supplierOffer.findMany({
        orderBy: { createdAt: "desc" },
        take: 2000,
        include: { supplier: { select: { id: true, email: true, status: true } } },
      }),
      prisma.supplierAccount.findMany({
        orderBy: { createdAt: "desc" },
        take: 2000,
        select: {
          id: true,
          email: true,
          name: true,
          mobile: true,
          companyName: true,
          wechatId: true,
          companyAddress: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          _count: { select: { offers: true } },
        },
      }),
    ]);

    const boardOffers: BoardOffer[] = offers.map((o) => ({
      id: o.id,
      productId: o.productId,
      productName: o.productName,
      productImage: o.productImage,
      categoryName: o.categoryName,
      moq: o.moq,
      moqUnit: o.moqUnit,
      details: o.details,
      photos: o.photos,
      contactName: o.contactName,
      companyName: o.companyName,
      mobile: o.mobile,
      wechatId: o.wechatId,
      companyAddress: o.companyAddress,
      status: isOfferStatus(o.status) ? o.status : "NEW",
      reply: o.reply,
      reviewedAt: o.reviewedAt?.toISOString() ?? null,
      reviewedBy: o.reviewedBy,
      createdAt: o.createdAt.toISOString(),
      supplierId: o.supplier.id,
      supplierEmail: o.supplier.email,
      supplierBlocked: o.supplier.status !== "ACTIVE",
    }));
    const boardAccounts: BoardAccount[] = accounts.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name,
      mobile: a.mobile,
      companyName: a.companyName,
      wechatId: a.wechatId,
      companyAddress: a.companyAddress,
      status: a.status === "BLOCKED" ? "BLOCKED" : "ACTIVE",
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      offers: a._count.offers,
    }));

    return { offers: boardOffers, accounts: boardAccounts, capped: offers.length === 2000 || accounts.length === 2000 };
  } catch (error) {
    // The portal not set up yet (P2021: the table is missing) is said quietly; anything else is an error.
    if ((error as { code?: string })?.code === "P2021") {
      console.warn("new suppliers page: the supplier portal's tables are missing (prisma/migrations, supplier_portal).");
      return null;
    }
    console.error("new suppliers page:", error instanceof Error ? `${error.name}: ${error.message.split("\n")[0]}` : "unknown");
    return null;
  }
}
