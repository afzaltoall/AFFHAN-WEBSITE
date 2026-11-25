import type { Metadata } from "next";
import { displayFont } from "@/components/CinematicExperience/fonts";
import { TripClosedExperience } from "@/components/TripAccess/TripClosedExperience";
import { TRIP_FACTS } from "@/lib/trip-legal";

/**
 * What every page under /free-china-trip/ shows once applications have closed (the owner, 2026-11-25): the time left
 * until the winners are announced. The door (proxy.ts) rewrites to this from the first moment after 25 November, IST,
 * so the address stays the one asked for; the trip's Terms and Privacy Policy stay as they are. Before then its own
 * address sends everyone to the trip, but an admin signed in to the console, who sees it as it will be.
 *
 * Its own title and description, and never indexed: it stands in for the trip's pages.
 */
export const metadata: Metadata = {
  title: `Winners announced ${TRIP_FACTS.winnersAnnounced} | Free China Business Trip | AFFHAN`,
  description: `Applications for AFFHAN's Free China Business Trip closed on ${TRIP_FACTS.applicationsClose}. The winners are announced on ${TRIP_FACTS.winnersAnnounced}.`,
  robots: { index: false, follow: true },
};

export default function FreeChinaTripClosedPage() {
  return (
    <main className={`${displayFont.variable} cx pt-(--nav-h)`}>
      <TripClosedExperience />
    </main>
  );
}
