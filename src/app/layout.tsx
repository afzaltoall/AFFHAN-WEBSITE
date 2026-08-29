import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";
import { Navbar } from "@/components/sections/Navbar";
import { FOUNDING_DATE, LOGO_URL, OFFICES, ORG_ID, SITE_URL, SOCIAL_PROFILES, postalAddress } from "@/lib/brand";

// Premium, modern sans used site-wide. Plus Jakarta Sans reads far more
// refined than a generic system/Geist stack — the difference the brief called
// out as "cheap". Exposed as --font-geist-sans so existing references keep
// working without a sweep.
//
// No `weight` list on purpose. Plus Jakarta Sans is a variable font, so
// omitting it ships ONE file covering the whole 200-800 range. Naming the
// five weights instead built five separate files and preloaded all five on
// every route — and since no single page renders all five, the browser logged
// "preloaded but not used" for the leftovers on every page load.
const geistSans = Plus_Jakarta_Sans({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://affhan.com"),
  alternates: { canonical: "https://affhan.com/" },
  title: "AFFHAN - Global Sourcing, Shipping & China Import Export",
  description: "AFFHAN Group is a global B2B sourcing marketplace. Source 10 lakh+ products from China and 100+ countries with expert sourcing, shipping, supplier verification & freight forwarding.",
  keywords: "global b2b sourcing, china sourcing agent, product sourcing, import export company, freight forwarding, shipping company, sea freight, air freight, door to door shipping, nvocc, non-vessel operating common carrier, wholesale sourcing platform",
  openGraph: {
    title: "AFFHAN - Global Sourcing, Shipping & China Import Export",
    description: "AFFHAN Group is a global B2B sourcing marketplace. Source 10 lakh+ products from China and 100+ countries with expert sourcing, shipping, supplier verification & freight forwarding.",
    url: "https://affhan.com",
    siteName: "AFFHAN Group",
    type: "website",
    images: [
      {
        url: "/images/logo.png", // Fallback og:image
        width: 800,
        height: 600,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AFFHAN - Global Sourcing, Shipping & China Import Export",
    description: "AFFHAN Group is a global B2B sourcing marketplace. Source 10 lakh+ products from China and 100+ countries with expert sourcing, shipping, supplier verification & freight forwarding.",
  },
};

// Organization, not LocalBusiness, and that distinction is the whole point.
//
// This node renders on EVERY page. As a LocalBusiness describing the Chennai
// branch it therefore put a Chennai business — Indian phone number, Indian
// address — on the Dubai page, the UK page and every other location page,
// competing with the actual branch each of those pages is about. Google was
// being asked which of two businesses the Dubai page represented.
//
// It previously shared an @id with the Chennai page's own node to paper over
// that on Chennai specifically, which merged two LocalBusiness definitions
// into one entity and left the conflict everywhere else.
//
// The standard shape for a multi-location company is one Organization for the
// group plus one LocalBusiness per branch, each pointing back to it with
// parentOrganization. Every location page then declares exactly one business:
// its own.
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORG_ID,
  name: "AFFHAN International Pvt Ltd",
  legalName: OFFICES.chennai.legalName,
  image: LOGO_URL,
  logo: LOGO_URL,
  url: SITE_URL,
  // The group's registered office is Chennai, and this is the number its
  // Google profile lists first. The landline stays reachable as an alternate.
  telephone: OFFICES.chennai.telephone,
  email: "info@affhan.com",
  address: postalAddress(OFFICES.chennai),
  // "Opening date: 1 July 2000" on every one of the company's Google profiles.
  // Worth stating: twenty-five years of trading is the strongest trust signal
  // this business has, and nothing in the markup was carrying it.
  foundingDate: FOUNDING_DATE,
  // Profile roots, not sub-tabs. Facebook previously pointed at
  // /affhaninternational/reels/ — a tab inside the page rather than the page —
  // and this is the entity-linking signal Google reads on every URL of the
  // site, so it was the one worth getting exactly right.
  sameAs: [...SOCIAL_PROFILES],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Logistics and Sourcing Services",
    itemListElement: [
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Product Sourcing" } },
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "China Sourcing" } },
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Import Export" } },
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Freight Forwarding" } },
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Sea Freight" } },
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Air Freight" } },
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Door-to-Door Shipping" } },
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Customs Clearance" } },
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "NVOCC (Non-Vessel Operating Common Carrier)" } }
    ]
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={geistSans.variable} data-scroll-behavior="smooth">
      <body className="font-[family-name:var(--font-geist-sans)] w-full relative">
        {/* LocalBusiness JSON-LD Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <Suspense fallback={<div className="h-16" />}>
          <Navbar />
        </Suspense>
        {children}
        <WhatsAppButton />
      </body>
    </html>
  );
}
