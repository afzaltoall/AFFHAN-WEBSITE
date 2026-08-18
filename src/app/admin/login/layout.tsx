import type { Metadata } from "next";

// admin/login/page.tsx is a client component ("use client"), which can't
// export `metadata` itself — Next.js only resolves metadata from Server
// Components. This layout carries it instead. Same belt-and-braces reasoning
// as src/app/admin/page.tsx: robots.ts disallows /admin/login for crawling,
// this tag stops it being indexed even if linked from elsewhere.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
