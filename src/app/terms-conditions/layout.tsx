import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions | Affhan Group",
  description:
    "The terms governing your use of Affhan International's sourcing marketplace and quote-request services.",
};

export default function TermsConditionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
