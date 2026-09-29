import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions | AFFHAN",
  description:
    "The terms governing your use of AFFHAN International's sourcing marketplace and quote-request services.",
  alternates: { canonical: "https://affhan.com/terms-conditions/" },
  openGraph: {
    title: "Terms & Conditions | AFFHAN",
    description:
      "The terms governing your use of AFFHAN International's sourcing marketplace and quote-request services.",
    url: "https://affhan.com/terms-conditions/",
    type: "website",
    siteName: "AFFHAN",
    images: [{ url: "/images/logo.png", width: 800, height: 600 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms & Conditions | AFFHAN",
    description:
      "The terms governing your use of AFFHAN International's sourcing marketplace and quote-request services.",
  },
};

export default function TermsConditionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
