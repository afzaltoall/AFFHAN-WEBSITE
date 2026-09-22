import type { Metadata } from "next";

/**
 * This page had no metadata at all, and that is not the same as having none.
 *
 * With nothing of its own it inherited the root layout's title and description
 * verbatim, so /forgot-password/ went out as "Affhan | B2B Sourcing Company &
 * Import Export India" with the homepage's sentence underneath — a second URL
 * claiming to be the homepage, and indexable, while /login/ next door was
 * already noindex.
 *
 * follow, not nofollow: there is nothing here worth ranking, but the links out
 * of it are ordinary site links and should keep passing.
 *
 * No canonical, deliberately. The root layout sets none — a wrong canonical is
 * worse than an absent one — and on a noindex page a self-canonical adds
 * nothing the directive has not already said.
 */
const TITLE = "Reset your password | Affhan";
const DESCRIPTION =
  "Reset the password on your Affhan account. We email you a code to confirm it is you, then you choose a new password and sign back in.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false, follow: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://affhan.com/forgot-password/",
    type: "website",
    siteName: "Affhan",
    images: [{ url: "/images/logo.png", width: 800, height: 600 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
