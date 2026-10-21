import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentSupplier } from "@/lib/supplier-session";
import { SupplierProfile } from "@/components/supplier/SupplierProfile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Profile" };

/** The supplier's own details and password. */
export default async function SupplierProfilePage() {
  const supplier = await currentSupplier();
  if (!supplier) redirect("/supplier/login/");
  return (
    <SupplierProfile
      account={{
        email: supplier.email,
        name: supplier.name,
        mobile: supplier.mobile,
        companyName: supplier.companyName ?? "",
        wechatId: supplier.wechatId ?? "",
        companyAddress: supplier.companyAddress ?? "",
        since: supplier.createdAt.toISOString(),
      }}
    />
  );
}
