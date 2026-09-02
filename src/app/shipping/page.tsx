import type { Metadata } from "next";
import { ShippingContent } from "@/components/ui/ShippingContent";
import { FooterSection } from "@/components/sections/FooterSection";

export const metadata: Metadata = {
  title: "Shipping & Freight Forwarding | Affhan Group",
  description:
    "Sea and air freight, NVOCC, customs clearance and door-to-door delivery from Affhan Group, with offices in Chennai, Guangzhou, Dubai, Singapore, Malaysia and the UK.",
  alternates: { canonical: "https://affhan.com/shipping/" },
};

export default function ShippingPage() {
  return (
    <>
      <ShippingContent />
      <FooterSection />
    </>
  );
}
