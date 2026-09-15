import type { Metadata } from "next";
import { FooterSection } from "@/components/sections/FooterSection";
import { Contact2 } from "@/components/ui/contact-2";
import { OfficeLocations } from "@/components/sections/OfficeLocations";

// The NAP belongs in the snippet, not only on the page.
//
// The old description ran to 179 characters — truncated in results — and spent
// all of them on a list of countries, so the phone number, the email address
// and the city someone searching "affhan contact number" actually wants were
// nowhere in the snippet. They are the first thing in it now.
const PAGE_TITLE = "Contact AFFHAN | Chennai Office, Phone & Email";
const PAGE_DESCRIPTION =
  "Call AFFHAN on +91 90920 09044 or email info@affhan.com. Head office in Royapuram, Chennai, with offices in Guangzhou, Dubai, London and Singapore.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "https://affhan.com/contact/" },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "https://affhan.com/contact/",
    siteName: "AFFHAN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

export default function ContactPage() {
  return (
    <main className="relative min-h-screen bg-white text-slate-900">
      {/* Contact Form Section.
          The <h1> read "Contact Us" — two words, no brand, no city, on the one
          page people reach by searching the company name plus "contact". */}
      <Contact2
        title="Contact AFFHAN"
        description="Head office in Royapuram, Chennai, with sourcing and freight teams in Guangzhou, Dubai, London, Singapore and Melaka. Reach us for inquiries, quotations or support."
        phone="+91 90920 09044 / +91 44 4743 2777"
        email="info@affhan.com"
      />

      {/* Global Offices Section */}
      <OfficeLocations />

      <FooterSection />
    </main>
  );
}
