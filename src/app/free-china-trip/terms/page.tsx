import type { Metadata } from "next";
import { LegalPage } from "@/components/TripLegal/LegalPage";
import { TRIP_TERMS } from "@/lib/trip-legal";

/**
 * The Free China Business Trip's own Terms & Conditions (lib/trip-legal.ts),
 * which the application asks every applicant to agree to. Not the website's
 * /terms-conditions/, which is the main site's and is not touched by these.
 */

const TITLE = "Terms & Conditions | Free China Business Trip | AFFHAN";
const DESCRIPTION =
  "The Terms & Conditions of AFFHAN's Free China Business Trip: eligibility, the application period, the random selection of five winners, what the trip includes and what it does not.";
const PAGE_URL = "https://affhan.com/free-china-trip/terms/";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: { title: TITLE, description: DESCRIPTION, url: PAGE_URL, type: "website", siteName: "AFFHAN" },
};

export default function FreeChinaTripTermsPage() {
  return <LegalPage doc={TRIP_TERMS} kind="terms" />;
}
