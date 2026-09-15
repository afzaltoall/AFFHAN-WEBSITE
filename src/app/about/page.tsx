import type { Metadata } from "next";
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
      <h1 className="sr-only">About AFFHAN International — our story since 2000</h1>
      <AboutUsContent />
      <FooterSection />
    </>
  );
}
