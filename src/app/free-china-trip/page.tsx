import type { Metadata } from "next";
import { FooterSection } from "@/components/sections/FooterSection";
import { RevealNoScriptFallback } from "@/components/ui/Reveal";
import { CinematicExperience } from "@/components/CinematicExperience/CinematicExperience";
import { displayFont } from "@/components/CinematicExperience/fonts";

/**
 * The free China business trip, which the China trip banner on the homepage
 * advertises and leads to: a scroll-driven film, then the application.
 *
 * Everything lives in components/CinematicExperience/ (see its README.md for
 * what is still placeholder copy). This file is the route: metadata, and the
 * 64px of padding the site's fixed navbar needs on every page. (No image
 * preload: the first frame is the time opener, drawn in code; the pictures
 * follow in the order the opener needs them.) The navbar itself comes from the root layout
 * and is not touched.
 */

const TITLE = "Free China Business Trip | Affhan";
const DESCRIPTION =
  "A free China business trip with Affhan: round-trip flight, hotel stay, local transport and the China trip experience. Apply online in four short steps.";
const PAGE_URL = "https://affhan.com/free-china-trip/";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    type: "website",
    siteName: "Affhan",
    images: [{ url: "/china-trip-og.jpg", width: 1200, height: 450, alt: "Affhan's free China business trip" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/china-trip-og.jpg"] },
};

export default function FreeChinaTripPage() {
  return (
    <>
      <main className={`${displayFont.variable} cx pt-16`}>
        <RevealNoScriptFallback />
        {/* Without JavaScript the opener cannot play: skip it and show the hero. */}
        <noscript dangerouslySetInnerHTML={{ __html: "<style>[data-cx-opener]{display:none!important}[data-cx-hero]{visibility:visible!important;opacity:1!important}</style>" }} />
        <CinematicExperience />
      </main>
      <FooterSection />
    </>
  );
}
