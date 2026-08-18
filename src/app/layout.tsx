import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";
import { Navbar } from "@/components/sections/Navbar";

// Premium, modern sans used site-wide. Plus Jakarta Sans reads far more
// refined than a generic system/Geist stack — the difference the brief called
// out as "cheap". Exposed as --font-geist-sans so existing references keep
// working without a sweep.
const geistSans = Plus_Jakarta_Sans({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
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

const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "AFFHAN International Pvt Ltd",
  image: "https://affhan.com/images/logo.png",
  url: "https://affhan.com",
  telephone: "+91-44-4743-2777",
  email: "info@affhan.com",
  address: {
    "@type": "PostalAddress",
    streetAddress: "No.69/46, Appavoo Tower, West Madha Church Road, Royapuram",
    addressLocality: "Chennai",
    addressRegion: "Tamil Nadu",
    postalCode: "600013",
    addressCountry: "IN",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    reviewCount: "144"
  },
  sameAs: [
    "https://www.facebook.com/affhaninternational/reels/",
    "https://www.instagram.com/affhanglobal",
    "https://www.linkedin.com/company/affhanglobal/",
    "https://www.youtube.com/@affhan_global",
    "https://www.tiktok.com/@affhan_global",
    "https://x.com/affhan_shipping"
  ],
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} data-scroll-behavior="smooth">
      <body className="font-[family-name:var(--font-geist-sans)] w-full relative">
        {/* LocalBusiness JSON-LD Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
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
