import { NextResponse } from "next/server";
import { cronAuthorized, SecretMissingError } from "@/lib/secrets";

/**
 * The door of the routes a machine calls (the cron jobs and the revalidate
 * hook): null when the request carries `Authorization: Bearer <CRON_SECRET>`,
 * otherwise the answer to send instead. The comparison is constant-time
 * (lib/secrets.ts).
 *
 * 503 when the secret itself is missing or too short, because then the server
 * is misconfigured rather than the caller wrong, and the log says which
 * variable to set; 401 for everything else. Never open: there is no value of
 * the header that passes without the secret.
 */
export function refuseUnlessCron(request: Request): NextResponse | null {
  try {
    if (cronAuthorized(request.headers.get("authorization"))) return null;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch (e) {
    if (e instanceof SecretMissingError) {
      console.error(`[cron] ${e.message}`);
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
    throw e;
  }
}
