import type { Metadata } from "next";

// The page itself is a client component and cannot export metadata, so it
// lives here — the same arrangement as src/app/admin/login/layout.tsx.
// robots.ts disallows /employee as well; this is the belt to that's braces.
export const metadata: Metadata = {
  title: "Staff sign in — Affhan",
  robots: { index: false, follow: false },
};

export default function EmployeeLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
