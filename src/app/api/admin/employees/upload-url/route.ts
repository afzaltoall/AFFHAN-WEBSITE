import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createUploadTarget, storageConfigProblem } from "@/lib/video-storage";

export const dynamic = "force-dynamic";

/**
 * A presigned upload for a staff profile photo.
 *
 * The same flow the video console uses — the browser uploads straight to S3,
 * because a Vercel function caps its request body at 4.5MB — pointed at the
 * `employees/` prefix. The key is generated server-side: a caller that chose
 * its own could overwrite any object in the bucket, product images included.
 */
export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const problem = storageConfigProblem();
  if (problem) return NextResponse.json({ success: false, error: problem }, { status: 503 });

  try {
    const { contentType } = await request.json().catch(() => ({ contentType: "" }));
    if (!contentType || typeof contentType !== "string") {
      return NextResponse.json({ success: false, error: "contentType is required" }, { status: 400 });
    }

    const { uploadUrl, fields, publicUrl, key } = await createUploadTarget("employee", contentType);
    return NextResponse.json({ success: true, uploadUrl, uploadFields: fields, publicUrl, key });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Unsupported")) {
      return NextResponse.json({ success: false, error: "Use a JPEG, PNG or WebP image." }, { status: 400 });
    }
    console.error("employee photo upload target failed:", message);
    return NextResponse.json({ success: false, error: "Could not start the upload." }, { status: 500 });
  }
}
