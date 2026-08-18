import type { Metadata } from "next";
import { FooterSection } from "@/components/sections/FooterSection";
import { Contact2 } from "@/components/ui/contact-2";
import { OfficeLocations } from "@/components/sections/OfficeLocations";

export const metadata: Metadata = {
  title: "Contact Us | Affhan Group",
  description:
    "Get in touch with Affhan Group. Contact our global network of sourcing, warehousing, and custom compliance specialists in Guangzhou, London, India, Singapore, Malaysia, and Dubai.",
  alternates: { canonical: "https://affhan.com/contact/" },
};

export default function ContactPage() {
  return (
    <main className="relative min-h-screen bg-white text-slate-900">
      {/* Contact Form Section */}
      <Contact2
        title="Contact Us"
        description="We'd love to hear from you. Reach out for inquiries, support, or partnerships."
        phone="+91 90920 09044 / +91 44 4743 2777"
        email="info@affhan.com"
      />
      
      {/* Global Offices Section */}
      <OfficeLocations />

      <FooterSection />
    </main>
  );
}
