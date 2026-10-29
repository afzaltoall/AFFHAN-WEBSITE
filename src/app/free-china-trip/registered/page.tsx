import type { Metadata } from "next";
import { displayFont } from "@/components/CinematicExperience/fonts";
import { TripPreviewNote } from "@/components/TripAccess/TripPreviewNote";
import { RegisteredExperience } from "@/components/TripRegistered/RegisteredExperience";

/**
 * The Free China Business Trip's boarding pass: where a new participant lands after
 * submitting, and where the trip opens for anyone who has registered already
 * (by their account, or on the browser they applied from). Their boarding
 * pass, the draw, and what happens next; nothing about anyone else. Everything
 * lives in components/TripRegistered/.
 *
 * Open to everyone, like the rest of the trip (no sign-in since 2026-10-28).
 * Not indexed: it is a page about the visitor's own registration.
 */
export const metadata: Metadata = {
  title: "Your registration | Free China Business Trip | AFFHAN",
  description: "Your boarding pass for AFFHAN's Free China Business Trip, the draw, and what happens next.",
  robots: { index: false, follow: true },
};

export default function FreeChinaTripRegisteredPage() {
  return (
    <main className={`${displayFont.variable} cx pt-(--nav-h)`}>
      <RegisteredExperience />
      <TripPreviewNote />
    </main>
  );
}
