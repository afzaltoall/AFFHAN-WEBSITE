import type { Metadata } from "next";
import { catalogueCount } from "@/lib/supplier-catalogue";
import { SupplierForgotPassword } from "@/components/supplier/SupplierForgotPassword";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reset your password" };

export default async function SupplierForgotPasswordPage() {
  return <SupplierForgotPassword catalogueCount={await catalogueCount()} />;
}
