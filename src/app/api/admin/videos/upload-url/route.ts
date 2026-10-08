import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createUploadTarget, storageConfigProblem } from "@/lib/video-storage";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const problem = storageConfigProblem();
  if (problem) return NextResponse.json({ success: false, error: problem }, { status: 503 });

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
  } catch (error: unknown) {
    console.error("Failed to generate upload URL:", error);
    // An unsupported type is the caller's to fix, so say which types work; the
    // thrown message itself (which repeats the caller's input) stays in the log.
    if (error instanceof Error && error.message.includes("Unsupported")) {
      return NextResponse.json(
        { success: false, error: kindOf(error.message) === "video" ? "Use an MP4, WebM or MOV video." : "Use a JPEG, PNG or WebP image." },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

/** Which kind of upload an "Unsupported <kind> type" error was about. */
function kindOf(message: string): "video" | "image" {
  return /Unsupported video type/.test(message) ? "video" : "image";
}
