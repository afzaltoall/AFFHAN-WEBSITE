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
  title: "Affhan Sourcing | Global Trade B2B Platform",
  description: "A modern logistics and global sourcing website by Affhan Group.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} data-scroll-behavior="smooth">
      <body className="font-[family-name:var(--font-geist-sans)] w-full relative">
        <Suspense fallback={<div className="h-20" />}>
          <Navbar />
        </Suspense>
        {children}
        <WhatsAppButton />
      </body>
    </html>
  );
}
