import { NextResponse } from "next/server";
import { checkInstagramAccount } from "@/lib/server/instagram-task";
import { instagramErrorResponse, readCheckDecision, readInstagramAdmin } from "@/lib/server/instagram-auth";

export const dynamic = "force-dynamic";

/** An admin checks an account on Instagram, anyone's, HR's own included: what they saw, or that it does not count. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await readInstagramAdmin();
  if (!who.ok) return who.response;
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
