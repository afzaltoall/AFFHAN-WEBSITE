import type { Metadata } from "next";
import { preload } from "react-dom";
import { RevealNoScriptFallback } from "@/components/ui/Reveal";
import { CinematicExperience } from "@/components/CinematicExperience/CinematicExperience";
import { TripSignInGate } from "@/components/TripAccess/SignInGate";
import { TripPreviewNote } from "@/components/TripAccess/TripPreviewNote";
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
 * and is not touched. No footer, on the owner's request: the page ends on
 * the countdown. For signed-in visitors only: TripSignInGate frosts the page
 * and asks anyone else to sign in (the static page itself is unchanged).
 */

const TITLE = "Free China Business Trip | AFFHAN";
const DESCRIPTION =
  "AFFHAN's Free China Business Trip: round-trip flight, hotel stay, local transport and business guidance. Five winners, drawn at random. Applications close 25 November 2026.";
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
    siteName: "AFFHAN",
    images: [{ url: "/china-trip-og.jpg", width: 1200, height: 450, alt: "AFFHAN's free China business trip" }],
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
    <main className={`${displayFont.variable} cx pt-16`}>
      <RevealNoScriptFallback />
      {/* Without JavaScript the count cannot run: no counter, and the hero's
          entrance plays at once. */}
      <noscript dangerouslySetInnerHTML={{ __html: "<style>[data-cx-counter],[data-cx-clock]{display:none!important}[data-intro] .cx-enter-push,[data-intro] .cx-enter-glow,[data-intro] .cx-enter-silk,[data-intro] .cx-enter-rise{animation-play-state:running!important}</style>" }} />
      <CinematicExperience />
      <TripSignInGate />
      <TripPreviewNote />
    </main>
  );
}
