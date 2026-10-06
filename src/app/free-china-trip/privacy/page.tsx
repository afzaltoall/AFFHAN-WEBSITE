import type { Metadata } from "next";
import { LegalPage } from "@/components/TripLegal/LegalPage";
import { TripPreviewNote } from "@/components/TripAccess/TripPreviewNote";
import { TRIP_PRIVACY } from "@/lib/trip-legal";

/**
 * The Free China Business Trip's own Privacy Policy (lib/trip-legal.ts),
 * which the application asks every applicant to read and consent to. Not the
 * website's /privacy-policy/, which is the main site's and is not touched.
 */

const TITLE = "Privacy Policy | Free China Business Trip | AFFHAN";
const DESCRIPTION =
  "How AFFHAN collects, uses, shares and protects the personal information of applicants to the Free China Business Trip, and how to make a privacy request.";
const PAGE_URL = "https://affhan.com/free-china-trip/privacy/";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: { title: TITLE, description: DESCRIPTION, url: PAGE_URL, type: "website", siteName: "AFFHAN" },
};

export default function FreeChinaTripPrivacyPage() {
  return (
    <>
      <LegalPage doc={TRIP_PRIVACY} kind="privacy" />
      <TripPreviewNote />
    </>
  );
}
