import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Affhan Group",
  description:
    "How Affhan International collects, uses and protects the information you share when requesting a quote or contacting our sourcing team.",
  alternates: { canonical: "https://affhan.com/privacy-policy/" },
};

export default function PrivacyPolicyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
