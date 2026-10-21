import type { Metadata } from "next";

// The supplier portal (2026-10-21): sign-in, registration and, once signed in, the catalogue to apply from.
// robots.ts disallows /supplier as well; this is the belt to that's braces, as on /employee.
export const metadata: Metadata = {
  title: { default: "Supplier Centre | AFFHAN", template: "%s | AFFHAN Supplier Centre" },
  robots: { index: false, follow: false },
};

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return children;
}
