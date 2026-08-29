import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { SupplierDetail } from "@/components/admin/SupplierDetail";
import { splitProducts, supplierTitle, toSupplierRecord, tidyCase } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

const SELECT_NAME = { serial: true, personName: true, companyName: true } as const;

/**
 * The supplier's own name in the tab title. These pages get opened several at a
 * time — one per factory being chased — and "Suppliers | Affhan Admin" six
 * times over makes the tab strip useless.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const robots = { index: false, follow: false };

  // The auth check has to be repeated here. generateMetadata runs
  // independently of the page component, so the redirect below protects the
  // body and nothing else — without this, an anonymous request to
  // /admin/suppliers/1/ came back with <title>Wesmo Industries Limited
  // Guangzhou office</title>, and walking the ids from 1 upwards would hand
  // over the name of every supplier in the book. noindex keeps it out of
  // search results; it does nothing about someone simply asking for the URL.
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return { title: "Affhan Admin", robots };

  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (Number.isNaN(numericId)) return { title: "Supplier | Affhan Admin", robots };

  const row = await prisma.supplier.findUnique({ where: { id: numericId }, select: SELECT_NAME });
  if (!row) return { title: "Supplier not found | Affhan Admin", robots };

  const name = supplierTitle({
    company: tidyCase(row.companyName),
    person: tidyCase(row.personName),
    serial: row.serial,
    id: numericId,
  });
  return { title: `${name} | Affhan Suppliers`, robots };
}

const SELECT = {
  id: true, sourceRow: true, serial: true, personName: true,
  companyName: true, productsRaw: true, address: true, contactRaw: true,
} as const;

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (Number.isNaN(numericId)) notFound();

  const row = await prisma.supplier.findUnique({ where: { id: numericId }, select: SELECT });
  if (!row) notFound();

  const supplier = toSupplierRecord(row);

  // "Who else makes this" — matched on the supplier's first product term, which
  // is the one the team wrote first and so usually the main line. Matching on
  // the whole cell would find almost nothing, since two suppliers rarely have
  // the free-text product column written identically.
  const term = splitProducts(row.productsRaw)[0] ?? null;
  const relatedRows = term
    ? await prisma.supplier.findMany({
        where: { id: { not: numericId }, productsRaw: { contains: term, mode: "insensitive" } },
        orderBy: [{ serial: "asc" }],
        take: 8,
        select: SELECT,
      })
    : [];

  const related = relatedRows.map((r) => {
    const rec = toSupplierRecord(r);
    return {
      id: rec.id,
      title: supplierTitle(rec),
      // Only repeat the person when it isn't already the title.
      person: rec.company ? rec.person : "",
      productsRaw: rec.productsRaw,
    };
  });

  return <SupplierDetail supplier={supplier} related={related} relatedTerm={term ? tidyCase(term) : null} />;
}
