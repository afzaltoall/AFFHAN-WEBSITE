import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { lockIdProofs } from "@/lib/server/id-proof-lock";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  // Signing out locks applicants' ID proofs again too (lib/server/id-proof-lock.ts).
  lockIdProofs(res);
  return res;
}
