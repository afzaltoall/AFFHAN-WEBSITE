import type { Metadata } from "next";

/**
 * A sign-in form is not a search result. noindex here also replaces the
 * canonical this page used to inherit from the root layout, which pointed at
 * the homepage and told Google /login/ and / were the same page.
 */
export const metadata: Metadata = {
  title: "Sign in | Affhan Group",
  robots: { index: false, follow: true },
  alternates: { canonical: "https://affhan.com/login/" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
