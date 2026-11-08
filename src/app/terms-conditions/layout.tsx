import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions | AFFHAN",
  description:
    "The terms for using affhan.com and the AFFHAN app: quote requests, accounts, photo search, cargo tracking and the Supplier Centre.",
  alternates: { canonical: "https://affhan.com/terms-conditions/" },
  openGraph: {
    title: "Terms & Conditions | AFFHAN",
    description:
      "The terms for using affhan.com and the AFFHAN app: quote requests, accounts, photo search, cargo tracking and the Supplier Centre.",
    url: "https://affhan.com/terms-conditions/",
    type: "website",
    siteName: "AFFHAN",
    images: [{ url: "/images/logo.png", width: 800, height: 600 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms & Conditions | AFFHAN",
    description:
      "The terms for using affhan.com and the AFFHAN app: quote requests, accounts, photo search, cargo tracking and the Supplier Centre.",
  },
};

export default function TermsConditionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
