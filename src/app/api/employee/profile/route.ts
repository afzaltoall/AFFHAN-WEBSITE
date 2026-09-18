import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readEmployeeAuth } from "@/lib/employee-session";
import { isStaffPhotoUrl } from "@/lib/video-storage";

export const dynamic = "force-dynamic";

/**
 * What a member of staff may change about themselves: their photo.
 *
 * Name, email and region stay with the admin. They are how the console tells
 * the team apart and where leads get routed, so they are not self-service —
 * the profile page says so rather than offering fields that would be refused.
 *
 * `image: null` removes the photo. Anything else has to be a URL the photo
 * upload route issued (see isStaffPhotoUrl): a free-text URL here would let
 * anyone put any picture from anywhere in front of the admin.
 */
export async function PATCH(request: Request) {
  const auth = await readEmployeeAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Not signed in", reason: auth.reason }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (!("image" in (body ?? {}))) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }
  const image = body.image === null ? null : typeof body.image === "string" ? body.image.trim() : undefined;
  if (image === undefined || (image !== null && !isStaffPhotoUrl(image))) {
    return NextResponse.json({ error: "Upload the photo from this page, then save it." }, { status: 400 });
  }

  const employee = await prisma.employee.update({
    where: { id: auth.employee.id },
    data: { image },
    select: { image: true },
  });
  return NextResponse.json({ image: employee.image });
}
