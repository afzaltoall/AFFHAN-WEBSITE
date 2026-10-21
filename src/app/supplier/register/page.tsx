import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentSupplier } from "@/lib/supplier-session";
import { catalogueCount } from "@/lib/supplier-catalogue";
import { SupplierAuth } from "@/components/supplier/SupplierAuth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create a supplier account" };

/** The supplier door, opened on creating an account: the same card as /supplier/login/, in its other mode. */
export default async function SupplierRegisterPage() {
  if (await currentSupplier()) redirect("/supplier/");
  return <SupplierAuth initialMode="signup" catalogueCount={await catalogueCount()} />;
}
