import { NextResponse } from "next/server";
import { checkInstagramAccount } from "@/lib/server/instagram-task";
import { instagramErrorResponse, readCheckDecision, readInstagramEmployee } from "@/lib/server/instagram-auth";

export const dynamic = "force-dynamic";

/**
 * A tracker (HR) checks an account on Instagram: { state: "checked", posts, followers } is what they saw there;
 * { state: "rejected", note } says it does not count, and why. Never one of their own accounts (the server refuses:
 * those are an admin's or another tracker's to check). Staff sessions of trackers only.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await readInstagramEmployee();
  if (!who.ok) return who.response;
  if (!who.actor.tracker) return NextResponse.json({ error: "Only HR and the admins check accounts." }, { status: 403 });
  const { id } = await params;
  const decision = readCheckDecision((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (typeof decision === "string") return NextResponse.json({ error: decision }, { status: 400 });
  try {
    await checkInstagramAccount(who.actor, id, decision);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return instagramErrorResponse(e);
  }
}
