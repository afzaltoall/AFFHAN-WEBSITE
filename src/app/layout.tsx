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
  title: "AFFHAN — China Sourcing Company in Chennai | Import Export & Freight",
  description: "AFFHAN Group — trusted China sourcing, import-export & freight forwarding company in Chennai. 10 lakh+ products, 100+ countries. Source directly from verified suppliers.",
  keywords: "china sourcing chennai, sourcing company chennai, import export chennai, freight forwarding, b2b sourcing india",
  openGraph: {
    title: "AFFHAN — China Sourcing Company in Chennai | Import Export & Freight",
    description: "AFFHAN Group — trusted China sourcing, import-export & freight forwarding company in Chennai. 10 lakh+ products, 100+ countries. Source directly from verified suppliers.",
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
    title: "AFFHAN — China Sourcing Company in Chennai | Import Export & Freight",
    description: "AFFHAN Group — trusted China sourcing, import-export & freight forwarding company in Chennai. 10 lakh+ products, 100+ countries. Source directly from verified suppliers.",
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
