import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listCargoChanges } from "@/lib/cargo";
import { PRIVATE, cargoFailure } from "@/lib/cargo-http";

export const dynamic = "force-dynamic";

/**
 * Everything done on the cargo-tracking sheet, newest first, by whom: the admin's view of the assigners' work
 * (the owner, 2026-10-24: "I will check what all the assigning done"). Admins only; ?by=<name> narrows to one person.
 */
export async function GET(request: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE });
  try {
    const by = new URL(request.url).searchParams.get("by")?.trim() || undefined;
    return NextResponse.json(await listCargoChanges({ byName: by }), { headers: PRIVATE });
  } catch (error) {
    return cargoFailure(error, "changes");
  }
}
