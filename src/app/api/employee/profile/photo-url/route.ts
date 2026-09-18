import { NextResponse } from "next/server";
import { readEmployeeAuth } from "@/lib/employee-session";
import { createUploadTarget } from "@/lib/video-storage";

export const dynamic = "force-dynamic";

/**
 * A presigned upload for the signed-in employee's own photo.
 *
 * The admin route's twin (/api/admin/employees/upload-url): same prefix, same
 * key generated here rather than chosen by the caller, same type and size
 * limits enforced by S3 itself through the presigned policy. The upload goes
 * straight from the browser to S3; only the URL comes back through
 * /api/employee/profile, which checks it is one of these.
 */
export async function POST(request: Request) {
  const auth = await readEmployeeAuth();
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: "Not signed in", reason: auth.reason }, { status: 401 });
  }

  try {
    const { contentType } = await request.json().catch(() => ({ contentType: "" }));
    if (!contentType || typeof contentType !== "string") {
      return NextResponse.json({ success: false, error: "contentType is required" }, { status: 400 });
    }
    const { uploadUrl, fields, publicUrl } = await createUploadTarget("employee", contentType);
    return NextResponse.json({ success: true, uploadUrl, uploadFields: fields, publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Unsupported")) {
      return NextResponse.json({ success: false, error: "Use a JPEG, PNG or WebP image." }, { status: 400 });
    }
    console.error("staff self-photo upload target failed:", message);
    return NextResponse.json({ success: false, error: "Could not start the upload." }, { status: 500 });
  }
}
