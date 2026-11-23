import { instagramBoard } from "@/lib/server/instagram-task";
import { NextResponse } from "next/server";
import { instagramErrorResponse, noStore, readInstagramAdmin } from "@/lib/server/instagram-auth";

export const dynamic = "force-dynamic";

/** Everyone's accounts, for the console's Instagram task page, which reads it again every half minute. Admins only. */
export async function GET() {
  const who = await readInstagramAdmin();
  if (!who.ok) return who.response;
  try {
    return NextResponse.json(await instagramBoard(), { headers: noStore });
  } catch (e) {
    return instagramErrorResponse(e);
  }
}
