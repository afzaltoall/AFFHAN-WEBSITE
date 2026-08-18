import type { Metadata } from "next";
import AboutUsContent from "@/components/ui/about-us-content";
import { FooterSection } from "@/components/sections/FooterSection";

export const metadata: Metadata = {
  title: "About Us | Affhan Group",
  description:
    "Learn about Affhan Group, a global import, export and sourcing company supporting product sourcing, quality control, freight and end-to-end delivery.",
  alternates: { canonical: "https://affhan.com/about/" },
};

export default function AboutPage() {
  return (
    <>
      <AboutUsContent />
      <FooterSection />
    </>
  );
}
