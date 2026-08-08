import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Careers | Affhan Group",
  description:
    "Join Affhan International — global sourcing, quality control, freight and logistics teams across Chennai, Guangzhou, London, Singapore, Malaysia and Dubai.",
};

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
