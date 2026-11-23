import { NextResponse } from "next/server";
import { instagramHistory } from "@/lib/server/instagram-task";
import { instagramErrorResponse, noStore, readInstagramAdmin } from "@/lib/server/instagram-auth";

export const dynamic = "force-dynamic";

/** One person's history in the task, for the console's panel. Admins only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await readInstagramAdmin();
  if (!who.ok) return who.response;
  const { id } = await params;
  try {
    return NextResponse.json({ events: await instagramHistory(id) }, { headers: noStore });
  } catch (e) {
    return instagramErrorResponse(e);
  }
}
