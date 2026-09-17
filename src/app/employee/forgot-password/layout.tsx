import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset staff password — Affhan",
  robots: { index: false, follow: false },
};

export default function EmployeeForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
