import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentSupplier } from "@/lib/supplier-session";
import { catalogueCount } from "@/lib/supplier-catalogue";
import { SupplierAuth } from "@/components/supplier/SupplierAuth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Supplier sign in" };

/** The supplier door (the footer's "Supplier Login"), on signing in. A supplier already signed in goes straight in. */
export default async function SupplierLoginPage() {
  if (await currentSupplier()) redirect("/supplier/");
  return <SupplierAuth initialMode="signin" catalogueCount={await catalogueCount()} />;
}
