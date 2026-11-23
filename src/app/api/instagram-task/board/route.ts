import { NextResponse } from "next/server";
import { instagramBoard } from "@/lib/server/instagram-task";
import { instagramErrorResponse, noStore, readInstagramEmployee } from "@/lib/server/instagram-auth";

export const dynamic = "force-dynamic";

/** Everyone's accounts, for a tracker's (HR's) board, which reads it again every half minute. Trackers only, never cached. */
export async function GET() {
  const who = await readInstagramEmployee();
  if (!who.ok) return who.response;
  if (!who.actor.tracker) return NextResponse.json({ error: "Only HR and the admins see everyone's accounts." }, { status: 403 });
  try {
    return NextResponse.json(await instagramBoard(), { headers: noStore });
  } catch (e) {
    return instagramErrorResponse(e);
  }
}
