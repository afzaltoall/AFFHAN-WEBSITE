import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { removeEmployees } from "@/lib/server/staff-removal";

export const dynamic = "force-dynamic";

/**
 * Delete employees from Employee tasks: { ids } (the owner, 2026-11-03). One with no history is deleted; one with any
 * is switched off instead, keeping their record (lib/server/staff-removal.ts). Answers who went which way. Admins only.
 */
export async function POST(req: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) && body.ids.length > 0 && body.ids.length <= 500 && body.ids.every((x) => typeof x === "string") ? (body.ids as string[]) : null;
  if (!ids) return NextResponse.json({ error: "Choose the employees to delete." }, { status: 400 });
  try {
    return NextResponse.json(await removeEmployees(ids, admin.name || admin.email));
  } catch (e) {
    console.error("remove employees:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "That did not finish. The list shows where things stand now; try again." }, { status: 500 });
  }
}
