import { NextResponse, type NextRequest } from "next/server";
import { checkTripDocumentUploadRateLimit, limitReached } from "@/lib/rate-limit";
import { documentStorageProblem, documentUploadTarget } from "@/lib/server/trip-documents";
import { liveReferralCode } from "@/lib/server/trip-referrals";
import { applicationWindow } from "@/lib/trip-application";
import { TRIP_LOCKED_ERROR, tripClosedHere } from "@/lib/trip-lock";
import { ID_PROOF_NEEDED, isIdDocumentType, isIdProof } from "@/lib/trip-referral-shared";

export const dynamic = "force-dynamic";

/**
 * Where an applicant who came through an employee's link uploads their ID proof (the owner, 2026-11-02): one
 * presigned POST to the private documents bucket for one file (lib/server/trip-documents.ts). Offered only with a
 * live employee's code, so nobody else can put files in the bucket; "not_live" tells the form to forget the code, and
 * its visitor applies like anyone else. The key is made here, and the application checks every key it is sent.
 */
export async function POST(req: NextRequest) {
  const limited = await checkTripDocumentUploadRateLimit(req);
  if (!limited.success) return limitReached("Several files have been uploaded from this connection in the last hour.", limited);

  if (await tripClosedHere()) return NextResponse.json({ error: TRIP_LOCKED_ERROR, reason: "locked" }, { status: 403 });
  if (applicationWindow() !== "open") return NextResponse.json({ error: "Applications are not being taken now.", reason: "closed" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { code?: unknown; contentType?: unknown; proof?: unknown };
  if (!isIdDocumentType(body.contentType)) return NextResponse.json({ error: "Please add a photo (JPEG, PNG or WebP) or a PDF." }, { status: 400 });
  // Which of the five IDs it is (ID_PROOFS): none other is taken.
  if (!isIdProof(body.proof)) return NextResponse.json({ error: ID_PROOF_NEEDED }, { status: 400 });

  try {
    if (!(await liveReferralCode(body.code))) return NextResponse.json({ error: "This upload isn't available.", reason: "not_live" }, { status: 403 });
  } catch (e) {
    console.error("trip document upload, code check:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not start the upload. Please try again." }, { status: 500 });
  }

  const problem = documentStorageProblem();
  if (problem) {
    console.error("trip document upload:", problem);
    return NextResponse.json({ error: "Uploading is unavailable right now. Please try again in a few minutes." }, { status: 503 });
  }
  try {
    const { uploadUrl, fields, key } = await documentUploadTarget(body.contentType, body.proof);
    return NextResponse.json({ uploadUrl, uploadFields: fields, key }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("trip document upload target failed:", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "Could not start the upload. Please try again." }, { status: 500 });
  }
}
