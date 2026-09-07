import type { Metadata } from "next";
import { AccountNavShell } from "@/components/account/AccountNavShell";

/**
 * A server layout wrapping the client account shell, so these routes can carry
 * metadata at all — a "use client" layout cannot export any.
 *
 * Every section here is behind a sign-in and shows one customer their own
 * favourites, history and inquiries. It has nothing to offer a crawler, and
 * until now it inherited the root layout's canonical and told Google each of
 * these URLs was the homepage.
 */
export const metadata: Metadata = {
  title: "My Account | Affhan Group",
  robots: { index: false, follow: false },
  alternates: { canonical: "https://affhan.com/account/" },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountNavShell>{children}</AccountNavShell>;
}
