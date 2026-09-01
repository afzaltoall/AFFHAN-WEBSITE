import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createUploadTarget } from "@/lib/video-storage";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { kind, contentType } = body;

    if (kind !== "video" && kind !== "thumbnail") {
      return NextResponse.json({ success: false, error: "kind must be 'video' or 'thumbnail'" }, { status: 400 });
    }
    if (!contentType || typeof contentType !== "string") {
      return NextResponse.json({ success: false, error: "contentType is required" }, { status: 400 });
    }

    const { uploadUrl, fields, publicUrl, key } = await createUploadTarget(kind, contentType);

    return NextResponse.json({ success: true, uploadUrl, uploadFields: fields, publicUrl, key });
  } catch (error: any) {
    console.error("Failed to generate upload URL:", error);
    // Let the client know if it's an unsupported content type
    if (error.message?.includes("Unsupported")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
