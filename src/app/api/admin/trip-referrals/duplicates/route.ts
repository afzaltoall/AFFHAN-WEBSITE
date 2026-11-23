import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { referralDuplicates } from "@/lib/server/trip-duplicates";

export const dynamic = "force-dynamic";

/**
 * Employee tasks → Duplicates (2026-11-23): applications that may be one person twice, by the same mobile number, the
 * same ID file or the same name in the same city, with what is still to decide (lib/server/trip-duplicates.ts). It
 * carries applicants' names and numbers, so: admins only, and never cached. Decisions go through ../decide/.
 */
export async function GET() {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await referralDuplicates(), { headers: { "Cache-Control": "no-store" } });
}
