import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { referralIdProofs } from "@/lib/server/trip-id-proofs";

export const dynamic = "force-dynamic";

/**
 * Employee tasks → ID proofs (2026-11-23): every application through a link with the ID proof it sent, to look at and
 * mark Wrong document (lib/server/trip-id-proofs.ts). Applicants' names and their files' ids: admins only, never cached.
 * The files themselves open only through /api/admin/trip-documents/<id>/, behind the admin's password. Decisions go
 * through ../decide/.
 */
export async function GET() {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await referralIdProofs(), { headers: { "Cache-Control": "no-store" } });
}
