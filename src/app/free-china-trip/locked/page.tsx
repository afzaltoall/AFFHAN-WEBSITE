import type { Metadata } from "next";
import { displayFont } from "@/components/CinematicExperience/fonts";
import { TripLockedExperience } from "@/components/TripAccess/TripLockedExperience";

/**
 * What every page under /free-china-trip/ shows while the trip is locked:
 * the door (proxy.ts) rewrites to this, so the address stays the one asked
 * for, and this page opens into it the moment the trip is unlocked. Asked for
 * by its own address once the trip is open, the door sends it on to the trip.
 *
 * Its own title and description, and none of the trip's, and never indexed:
 * it stands in for pages a search engine should keep, or not know of yet.
 */
export const metadata: Metadata = {
  title: "Opening soon | Free China Business Trip | AFFHAN",
  description: "AFFHAN's Free China Business Trip is not open yet.",
  robots: { index: false, follow: true },
};

export default function FreeChinaTripLockedPage() {
  return (
    <main className={`${displayFont.variable} pt-16`}>
      <TripLockedExperience />
    </main>
  );
}
