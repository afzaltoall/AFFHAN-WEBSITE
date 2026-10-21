import { NextResponse } from "next/server";
import { readSupplier } from "@/lib/supplier-session";
import { checkSupplierUploadRateLimit, limiterUnavailable, limitReached } from "@/lib/rate-limit";
import { createUploadTarget, storageConfigProblem } from "@/lib/video-storage";

export const dynamic = "force-dynamic";

/**
 * A presigned upload for one photo of a supplier's product: the staff photo route's twin
 * (app/api/employee/profile/photo-url). The key is made here, under suppliers/, never chosen by the caller;
 * S3 itself holds the upload to the type asked for and to 8 MB, through the signed policy. The file goes
 * straight from the browser to S3, and only its URL comes back in the application, which checks it is one
 * of these (isSupplierPhotoUrl).
 */
export async function POST(request: Request) {
  const supplier = await readSupplier();
  if (!supplier) return NextResponse.json({ error: "Your session has ended. Sign in again.", reason: "signed_out" }, { status: 401 });

  const limit = await checkSupplierUploadRateLimit(supplier.id);
  if (limit.unavailable) return limiterUnavailable("Photo upload");
  if (!limit.success) return limitReached("You have uploaded a lot of photos in the last hour.", limit, "You can still send applications without photos.");

  const problem = storageConfigProblem();
  if (problem) {
    console.error("supplier photo upload:", problem);
    return NextResponse.json({ error: "Photo upload is unavailable right now. You can send the application without photos." }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const contentType = typeof body?.contentType === "string" ? body.contentType : "";
    const { uploadUrl, fields, publicUrl } = await createUploadTarget("supplier", contentType);
    return NextResponse.json({ uploadUrl, uploadFields: fields, publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Unsupported")) {
      return NextResponse.json({ error: "Use a JPEG, PNG or WebP photo." }, { status: 400 });
    }
    console.error("supplier photo upload target failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Could not start the upload. Try again." }, { status: 500 });
  }
}
