import type { Metadata } from "next";

/**
 * A sign-in form is not a search result. noindex here also replaces the
 * canonical this page used to inherit from the root layout, which pointed at
 * the homepage and told Google /login/ and / were the same page.
 *
 * The description is its own. Without one this page inherited the root
 * layout's, so /login/, /forgot-password/ and the homepage all described
 * themselves with the same sentence about sourcing 10 lakh+ products — true
 * of the company, and nothing to do with a sign-in form.
 */
export const metadata: Metadata = {
  title: "Sign in | Affhan",
  description:
    "Sign in to your Affhan account with the email and password you registered, or create one to save products and follow up on your quote requests.",
  robots: { index: false, follow: true },
  alternates: { canonical: "https://affhan.com/login/" },
  openGraph: {
    title: "Sign in | Affhan",
    description:
      "Sign in to your Affhan account with the email and password you registered, or create one to save products and follow up on your quote requests.",
    url: "https://affhan.com/login/",
    type: "website",
    siteName: "Affhan",
    images: [{ url: "/images/logo.png", width: 800, height: 600 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sign in | Affhan",
    description:
      "Sign in to your Affhan account with the email and password you registered, or create one to save products and follow up on your quote requests.",
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
