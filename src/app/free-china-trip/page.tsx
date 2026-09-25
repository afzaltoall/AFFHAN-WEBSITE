import type { Metadata } from "next";
import { preload } from "react-dom";
import { FooterSection } from "@/components/sections/FooterSection";
import { RevealNoScriptFallback } from "@/components/ui/Reveal";
import { CinematicExperience } from "@/components/CinematicExperience/CinematicExperience";
import { ASSETS, srcSetOf } from "@/components/CinematicExperience/assets";
import { displayFont } from "@/components/CinematicExperience/fonts";

/**
 * The free China business trip, which the China trip banner on the homepage
 * advertises and leads to: a scroll-driven film, then the application.
 *
 * Everything lives in components/CinematicExperience/ (see its README.md for
 * what is still placeholder copy). This file is the route: metadata, the one
 * preload the first frame needs, and the 64px of padding the site's fixed
 * navbar needs on every page. The navbar itself comes from the root layout
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
  // The opening frame's picture, requested with the document rather than
  // after the stylesheet and scripts. Same srcset and sizes as its <img>, so
  // the browser reuses this response instead of fetching twice.
  preload(ASSETS.traveler.src, {
    as: "image",
    fetchPriority: "high",
    imageSrcSet: srcSetOf(ASSETS.traveler),
    imageSizes: "(min-width: 768px) 68vw, 156vw",
  });

  return (
    <>
      <main className={`${displayFont.variable} cx pt-16`}>
        {/* A refresh opens the film at its first frame. Left to itself the
            browser restores the old scroll position into the server-rendered
            page, which is only one screen of film tall until the script gives
            the film its real length: it lands on the form, then jumps. This
            runs while the page is parsed, before any restore happens.
            CinematicExperience puts it back to "auto" when you leave. */}
        <script dangerouslySetInnerHTML={{ __html: "try{history.scrollRestoration='manual'}catch(e){}" }} />
        <RevealNoScriptFallback />
        <CinematicExperience />
      </main>
      <FooterSection />
    </>
  );
}
