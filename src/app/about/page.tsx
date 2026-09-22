import type { Metadata } from "next";
import Link from "next/link";
import AboutUsContent from "@/components/ui/about-us-content";
import { FooterSection } from "@/components/sections/FooterSection";

// Story and trust, not service keywords.
//
// This description used to read "a global import, export and sourcing
// company…", which put /about/ in the running for the same generic queries as
// the homepage and the location pages — three of our own URLs competing for
// one result. The homepage now owns "sourcing company"; this page owns who we
// are, since when, and who signs the paperwork.
const PAGE_TITLE = "About Affhan | Our Story, Team and Offices";
const PAGE_DESCRIPTION =
  "AFFHAN International Pvt Ltd has traded since 2000. Meet founder Afzal Khan, the leadership team and the seven registered offices behind the group.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "https://affhan.com/about/" },
  // Without these the page inherited the homepage's Open Graph card, so every
  // share of /about/ showed the homepage's title and blurb.
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "https://affhan.com/about/",
    siteName: "Affhan",
    type: "website",
    images: [
      {
        url: "/images/logo.png",
        width: 800,
        height: 600,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

export default function AboutPage() {
  return (
    <>
      {/* The page had no <h1> at all — its first heading was an <h2> tagline
          inside a scroll-driven sticky sequence, which is not a page title and
          cannot become one without breaking the animation. Visually hidden, so
          the opening sequence is untouched; same approach as the homepage. */}
      <h1 className="sr-only">About Affhan International — our story since 2000</h1>
      <AboutUsContent />
      {/* The offices this page talks about, as links to the pages that describe
          them. The story component names them in prose and in an animated
          sequence, neither of which produces an anchor — so the one page on the
          site whose subject IS the offices linked to none of them. */}
      <section className="border-t border-slate-200 bg-white py-12 lg:py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="mx-auto max-w-3xl text-pretty text-center text-sm leading-[1.7] text-slate-600 sm:text-base">
            Seven registered offices, each with its own page: our{" "}
            <Link href="/sourcing-company-chennai/" className="text-[#176579] font-medium underline underline-offset-2 hover:text-brand-dark">
              sourcing agent in Chennai
            </Link>{" "}
            and the head office behind it, the{" "}
            <Link href="/china-sourcing-office-guangzhou/" className="text-[#176579] font-medium underline underline-offset-2 hover:text-brand-dark">
              China buying office in Guangzhou
            </Link>
            , our{" "}
            <Link href="/sourcing-company-dubai/" className="text-[#176579] font-medium underline underline-offset-2 hover:text-brand-dark">
              sourcing company in Dubai
            </Link>
            ,{" "}
            <Link href="/sourcing-company-uk/" className="text-[#176579] font-medium underline underline-offset-2 hover:text-brand-dark">
              sourcing company in London
            </Link>
            ,{" "}
            <Link href="/sourcing-company-singapore/" className="text-[#176579] font-medium underline underline-offset-2 hover:text-brand-dark">
              sourcing company in Singapore
            </Link>
            ,{" "}
            <Link href="/sourcing-company-malaysia/" className="text-[#176579] font-medium underline underline-offset-2 hover:text-brand-dark">
              import agent in Malaysia
            </Link>{" "}
            and{" "}
            <Link href="/sourcing-company-france/" className="text-[#176579] font-medium underline underline-offset-2 hover:text-brand-dark">
              China sourcing agent in France
            </Link>
            . What those offices source is in the{" "}
            <Link href="/products/" className="text-[#176579] font-medium underline underline-offset-2 hover:text-brand-dark">
              product catalogue
            </Link>
            .
          </p>
        </div>
      </section>
      <FooterSection />
    </>
  );
}
