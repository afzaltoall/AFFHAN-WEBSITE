import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { deleteObject, keyFromPublicUrl } from "@/lib/video-storage";

import { checkVideoViewRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

/**
 * GET /api/videos/:id — detail, and counts the view.
 *
 * The increment is an atomic `increment`, not a read-then-write: two viewers
 * arriving together would otherwise read the same number and both write it
 * back, losing one of the views.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const rateLimit = await checkVideoViewRateLimit(req as any, id);

    // If rate limited, we still return the video, just DON'T increment the views.
    if (!rateLimit.success) {
      const video = await prisma.video.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          description: true,
          thumbnailUrl: true,
          videoUrl: true,
          views: true,
          createdAt: true,
          categoryId: true,
          category: { select: { id: true, name: true } },
        },
      });
      if (!video) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      return NextResponse.json({ success: true, data: video });
    }

    // update() both counts the view and returns the row, so this is one
    // round trip rather than a select followed by an update.
    const video = await prisma.video.update({
      where: { id },
      data: { views: { increment: 1 } },
      select: {
        id: true,
        title: true,
        description: true,
        thumbnailUrl: true,
        videoUrl: true,
        views: true,
        createdAt: true,
        categoryId: true,
        category: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: video });
  } catch (error: unknown) {
    // P2025 is Prisma's "record not found", which is a 404 rather than a 500.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    console.error("Failed to fetch video:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/videos/:id — admin only.
 *
 * Removes the row and then the two S3 objects. The row goes first: if the
 * bucket delete fails, an orphaned object costs pennies of storage, whereas a
 * row pointing at a file that no longer exists is a broken tile in the app.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const video = await prisma.video.findUnique({
      where: { id },
      select: { videoUrl: true, thumbnailUrl: true },
    });
    if (!video) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    await prisma.video.delete({ where: { id } });

    // keyFromPublicUrl returns null for anything outside our videos/ prefix,
    // so a row holding some other URL cannot make this delete an unrelated
    // object from the bucket.
    for (const url of [video.videoUrl, video.thumbnailUrl]) {
      const key = keyFromPublicUrl(url);
      if (!key) continue;
      try {
        await deleteObject(key);
      } catch (e) {
        console.error(`Deleted video ${id} but its object ${key} remains:`, e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete video:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
