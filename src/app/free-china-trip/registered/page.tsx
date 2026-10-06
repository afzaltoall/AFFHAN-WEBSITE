import type { Metadata } from "next";
import { displayFont } from "@/components/CinematicExperience/fonts";
import { TripSignInGate } from "@/components/TripAccess/SignInGate";
import { TripPreviewNote } from "@/components/TripAccess/TripPreviewNote";
import { RegisteredExperience } from "@/components/TripRegistered/RegisteredExperience";

/**
 * The Free China Business Trip's participants board: where a new participant
 * lands after submitting, and where the trip opens for anyone who has
 * registered already. Everything lives in components/TripRegistered/.
 *
 * For signed-in visitors only (TripSignInGate), like the rest of the trip.
 * Not indexed: it is a page about the visitor's own registration.
 */
export const metadata: Metadata = {
  title: "Participants | Free China Business Trip | AFFHAN",
  description: "Everyone registered for AFFHAN's Free China Business Trip, live.",
  robots: { index: false, follow: true },
};

export default function FreeChinaTripRegisteredPage() {
  return (
    <main className={`${displayFont.variable} cx pt-16`}>
      <RegisteredExperience />
      <TripSignInGate />
      <TripPreviewNote />
    </main>
  );
}
