import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { SupplierDirectory } from "@/components/admin/SupplierDirectory";
import { toSupplierRecord } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

// Same belt-and-braces as the dashboard: robots.ts disallows /admin, and this
// tag stops the page being indexed even if the URL leaks some other way. This
// is the company's entire supplier list — the one thing on the site a
// competitor would most like to read.
export const metadata: Metadata = {
  title: "Suppliers | Affhan Admin",
  robots: { index: false, follow: false },
};

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  // Read on the server and handed down as initial state, rather than pulled
  // from useSearchParams in the client. Same result, and it keeps the directory
  // out of the Suspense dance that hook requires.
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

  const rows = await prisma.supplier.findMany({
    orderBy: [{ serial: "asc" }, { sourceRow: "asc" }],
    select: {
      id: true, sourceRow: true, serial: true, personName: true,
      companyName: true, productsRaw: true, address: true, contactRaw: true,
    },
  });

  // Parsed here rather than in the browser: it is the same work either way, but
  // done on the server it happens once per request instead of once per client,
  // and the search haystacks arrive ready to use.
  const suppliers = rows.map(toSupplierRecord);

  return (
    <SupplierDirectory
      suppliers={suppliers}
      initialQuery={one(params.q)}
      initialProduct={one(params.product).toLowerCase()}
    />
  );
}
