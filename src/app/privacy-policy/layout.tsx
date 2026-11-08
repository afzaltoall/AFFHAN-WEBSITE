import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | AFFHAN",
  description:
    "What AFFHAN collects on affhan.com and in the AFFHAN app, why, who sees it, how long it is kept, and the cookies and emails we use.",
  alternates: { canonical: "https://affhan.com/privacy-policy/" },
  openGraph: {
    title: "Privacy Policy | AFFHAN",
    description:
      "What AFFHAN collects on affhan.com and in the AFFHAN app, why, who sees it, how long it is kept, and the cookies and emails we use.",
    url: "https://affhan.com/privacy-policy/",
    type: "website",
    siteName: "AFFHAN",
    images: [{ url: "/images/logo.png", width: 800, height: 600 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy | AFFHAN",
    description:
      "What AFFHAN collects on affhan.com and in the AFFHAN app, why, who sees it, how long it is kept, and the cookies and emails we use.",
  },
};

export default function PrivacyPolicyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
