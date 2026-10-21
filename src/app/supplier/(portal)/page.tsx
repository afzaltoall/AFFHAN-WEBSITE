import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentSupplier } from "@/lib/supplier-session";
import { catalogueCount, supplierFamilies } from "@/lib/supplier-catalogue";
import { OPEN_STATUSES } from "@/lib/supplier-offer";
import { getCachedAllCategories } from "@/lib/products";
import { blockedCategoryIdSet } from "@/lib/moderation";
import { categoryLabel } from "@/lib/searchIntent";
import { SupplierCatalogue } from "@/components/supplier/SupplierCatalogue";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Find products" };

/**
 * The supplier portal's first page: the whole catalogue to apply from (the owner, 2026-10-21: "all the 10 lakhs
 * of products have to be there"). The products themselves come from /api/products in the browser, the site's
 * own engine and moderation; this hands over what the page needs before them: the families to browse by, the
 * catalogue's size, what the supplier has open, and their contact details for the application form.
 */
export default async function SupplierCataloguePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supplier = await currentSupplier();
  if (!supplier) redirect("/supplier/login/");

  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

  const [families, total, open, all] = await Promise.all([
    supplierFamilies().catch(() => []),
    catalogueCount(),
    prisma.supplierOffer
      .findMany({
        where: { supplierId: supplier.id, productId: { not: null }, status: { in: [...OPEN_STATUSES] } },
        select: { id: true, productId: true },
      })
      .catch(() => []),
    getCachedAllCategories().catch(() => []),
  ]);

  // A category in the address (?cat=), named as the site names it, unless moderation hides it.
  const catId = one(params.cat).slice(0, 64);
  const blocked = blockedCategoryIdSet(all);
  const cat = catId && !blocked.has(catId) ? all.find((c) => c.id === catId) : undefined;
  const familyId = cat
    ? (families.find((f) => f.id === cat.id) ?? families.find((f) => f.children.some((c) => c.id === cat.id)))?.id ?? null
    : null;

  return (
    <SupplierCatalogue
      families={families}
      total={total}
      applied={Object.fromEntries(open.map((o) => [String(o.productId), o.id]))}
      contact={{
        name: supplier.name,
        mobile: supplier.mobile,
        companyName: supplier.companyName ?? "",
        wechatId: supplier.wechatId ?? "",
        companyAddress: supplier.companyAddress ?? "",
      }}
      initial={{
        q: one(params.q).slice(0, 120),
        scope: cat ? { id: cat.id, name: categoryLabel(cat.name, cat.parentName), familyId } : null,
      }}
      welcome={one(params.welcome) === "1"}
      firstName={supplier.name.split(/\s+/)[0] || supplier.name}
    />
  );
}
