import { NextResponse } from "next/server";
import { instagramHistory } from "@/lib/server/instagram-task";
import { instagramErrorResponse, noStore, readInstagramEmployee } from "@/lib/server/instagram-auth";

export const dynamic = "force-dynamic";

/** One person's history in the task (every add, report, check, rename and removal), for a tracker's panel. Trackers only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await readInstagramEmployee();
  if (!who.ok) return who.response;
  if (!who.actor.tracker) return NextResponse.json({ error: "Only HR and the admins see everyone's accounts." }, { status: 403 });
  const { id } = await params;
  try {
    return NextResponse.json({ events: await instagramHistory(id) }, { headers: noStore });
  } catch (e) {
    return instagramErrorResponse(e);
  }
}
