import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { deleteObject, keyFromPublicUrl } from "@/lib/video-storage";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

/**
 * GET /api/videos — the Play tab's list. Newest first, paginated.
 *
 * Deliberately does not select `description`: it can be long, the grid never
 * shows it, and sending it multiplies the payload of a list the app fetches on
 * every scroll. The detail route returns it.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));
  const categoryId = searchParams.get("categoryId") || undefined;

  try {
    const where = categoryId ? { categoryId } : {};
    const [data, total] = await Promise.all([
      prisma.video.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          videoUrl: true,
          views: true,
          createdAt: true,
        },
      }),
      prisma.video.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data,
      total,
      page,
      hasMore: page * limit < total,
    });
  } catch (error) {
    console.error("Failed to list videos:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error", data: [], total: 0, hasMore: false },
      { status: 500 }
    );
  }
}

/**
 * POST /api/videos — admin only. Metadata only.
 *
 * The file is already in S3 by the time this is called; the client uploaded it
 * with a presigned URL from /api/admin/videos/upload-url. A Vercel function
 * cannot accept the file itself — the request body limit is 4.5MB.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const title = (body.title ?? "").toString().trim();
    const thumbnailUrl = (body.thumbnailUrl ?? "").toString().trim();
    const videoUrl = (body.videoUrl ?? "").toString().trim();

    if (!title || !thumbnailUrl || !videoUrl) {
      return NextResponse.json(
        { success: false, error: "title, thumbnailUrl and videoUrl are required" },
        { status: 400 }
      );
    }

    // Only URLs we issued. Without this the row could point anywhere, and the
    // app would happily render a third-party URL as our own content.
    const cdn = process.env.NEXT_PUBLIC_CDN_URL!;
    if (!videoUrl.startsWith(`${cdn}/videos/`) || !thumbnailUrl.startsWith(`${cdn}/videos/`)) {
      return NextResponse.json(
        { success: false, error: "URLs must come from this app's upload endpoint" },
        { status: 400 }
      );
    }

    const categoryId = body.categoryId ? body.categoryId.toString() : null;
    if (categoryId) {
      const exists = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true },
      });
      if (!exists) {
        // Clean up orphaned files before returning error
        const vKey = keyFromPublicUrl(videoUrl);
        const tKey = keyFromPublicUrl(thumbnailUrl);
        if (vKey) await deleteObject(vKey).catch(console.error);
        if (tKey) await deleteObject(tKey).catch(console.error);
        return NextResponse.json(
          { success: false, error: "Unknown categoryId" },
          { status: 400 }
        );
      }
    }

    try {
      const video = await prisma.video.create({
        data: {
          title,
          description: body.description ? body.description.toString() : null,
          thumbnailUrl,
          videoUrl,
          categoryId,
        },
      });
      return NextResponse.json({ success: true, data: video }, { status: 201 });
    } catch (dbError) {
      console.error("Database error while creating video:", dbError);
      
      // Clean up the uploaded files on DB failure
      const vKey = keyFromPublicUrl(videoUrl);
      const tKey = keyFromPublicUrl(thumbnailUrl);
      if (vKey) await deleteObject(vKey).catch(console.error);
      if (tKey) await deleteObject(tKey).catch(console.error);
      
      throw dbError; // Rethrow to outer catch
    }
  } catch (error) {
    console.error("Failed to create video:", error);
    
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
