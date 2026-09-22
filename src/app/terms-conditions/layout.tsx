import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions | Affhan",
  description:
    "The terms governing your use of Affhan International's sourcing marketplace and quote-request services.",
  alternates: { canonical: "https://affhan.com/terms-conditions/" },
  openGraph: {
    title: "Terms & Conditions | Affhan",
    description:
      "The terms governing your use of Affhan International's sourcing marketplace and quote-request services.",
    url: "https://affhan.com/terms-conditions/",
    type: "website",
    siteName: "Affhan",
    images: [{ url: "/images/logo.png", width: 800, height: 600 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms & Conditions | Affhan",
    description:
      "The terms governing your use of Affhan International's sourcing marketplace and quote-request services.",
  },
};

export default function TermsConditionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
