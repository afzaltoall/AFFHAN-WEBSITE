import type { Metadata } from "next";
import Link from "next/link";
import { preload } from "react-dom";
import { ASSETS, srcSetOf } from "@/components/CinematicExperience/assets";
import { displayFont } from "@/components/CinematicExperience/fonts";
import { ApplyExperience } from "@/components/TripApplication/ApplyExperience";
import { NO_SCRIPT } from "@/components/TripApplication/content";

/**
 * The application for the free China business trip: the chapter after the
 * landing page's "Apply for the Trip". Everything lives in
 * components/TripApplication/ (see its README.md for what is placeholder).
 * The navbar comes from the root layout, untouched; the 64px of padding is
 * the room every page leaves for it. No footer, on the owner's request.
 *
 * Not indexed: it is a form, and /free-china-trip/ is the page to find.
 */

const TITLE = "Apply | Free China Business Trip | Affhan";
const DESCRIPTION = "Apply for Affhan's Free China Business Trip: tell us about yourself and your business in a few minutes.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "https://affhan.com/free-china-trip/apply/" },
  robots: { index: false, follow: true },
};

export default function FreeChinaTripApplyPage() {
  // The host is the intro's picture: requested with the document.
  preload(ASSETS.host.src, {
    as: "image",
    fetchPriority: "high",
    imageSrcSet: srcSetOf(ASSETS.host),
    imageSizes: "(min-width: 1024px) 34vw, 52vw",
  });

  return (
    <main className={`${displayFont.variable} cx pt-16`}>
      {/* Without a script nothing can reveal the intro, and the form can't
          run: show the words, and a way to reach Affhan. */}
      <noscript dangerouslySetInnerHTML={{ __html: "<style>.ax [data-ax-hide]{visibility:visible!important;opacity:1!important}.ax [data-ax-start]{display:none!important}</style>" }} />
      <noscript>
        <p className="mx-auto max-w-[36rem] px-6 pt-10 text-center text-[15px] text-(--cx-white)">
          {NO_SCRIPT.line}{" "}
          <Link href={NO_SCRIPT.contact.href} className="text-(--cx-gold) underline underline-offset-4">
            {NO_SCRIPT.contact.label}
          </Link>
        </p>
      </noscript>
      <ApplyExperience />
    </main>
  );
}
