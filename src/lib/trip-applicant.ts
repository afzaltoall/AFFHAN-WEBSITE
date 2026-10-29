import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { authSecret, authSecretOrNull } from "@/lib/secrets";
import { TRIP_APPLICANT_MAX_AGE_MS, readTripApplicantToken, signTripApplicantToken } from "@/lib/trip-applicant-token";

// ---------------------------------------------------------------------------
// The browser that sent an application to the Free China Business Trip, told
// apart without an account (applying needs none since 2026-10-28): a cookie
// naming its application, signed (lib/trip-applicant-token.ts), set when the
// application is recorded. The trip's pages read it to show that browser its
// own registration; a signed-in account's own is read by the account, as before.
//
// httpOnly, so no script reads it; lax, as the customer and supplier cookies
// are, so a link to the boarding pass from an email arrives knowing it.
// ---------------------------------------------------------------------------

export const TRIP_APPLICANT_COOKIE = "affhan_trip";

const options = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: Math.floor(TRIP_APPLICANT_MAX_AGE_MS / 1000),
};

/** The application this browser sent, by its cookie (its id), or null. */
export async function tripApplicantId(): Promise<string | null> {
  const store = await cookies();
  return readTripApplicantToken(store.get(TRIP_APPLICANT_COOKIE)?.value, authSecretOrNull());
}

/** Remember on this browser that it sent this application. Throws SecretMissingError without AUTH_SECRET, as every signer does. */
export function rememberTripApplicant(res: NextResponse, applicationId: string): NextResponse {
  res.cookies.set(TRIP_APPLICANT_COOKIE, signTripApplicantToken(applicationId, authSecret()), options);
  return res;
}
