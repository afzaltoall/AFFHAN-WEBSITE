import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { adminRelease } from "@/lib/lead-pool";
import { ASSIGN_GONE } from "@/lib/lead-pool-rules";

export const dynamic = "force-dynamic";

/**
 * An administrator's one control over who holds whom, from the Queue page: { entryId, action: "release" } puts a
 * held customer back in the open pool (somebody away, say). It is logged as the administrator's doing.
 *
 * Administrators no longer hand customers to people, or put given-up customers back (the owner, 2026-10-22): staff
 * take customers from the pool. The old "assign" answers 410 with the reason; anything else is a 400.
 */
export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const entryId = typeof body?.entryId === "string" ? body.entryId : "";
  const action = body?.action;
  if (action === "assign" || action === "requeue") return NextResponse.json({ error: ASSIGN_GONE }, { status: 410 });
  if (action !== "release") return NextResponse.json({ error: "action must be release" }, { status: 400 });
  if (!entryId) return NextResponse.json({ error: "entryId is required" }, { status: 400 });

  try {
    const result = await adminRelease({ entryId, by: admin.name || admin.email });
    if (!result.ok) return NextResponse.json({ error: "Nobody holds this customer now." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    console.error("queue release failed:", error instanceof Error ? error.name : "unknown", code ?? "");
    return NextResponse.json({ error: "Could not do that. Try again." }, { status: 500 });
  }
}
