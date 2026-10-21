import { NextResponse } from "next/server";
import { clearSupplierCookie } from "@/lib/supplier-session";

export const dynamic = "force-dynamic";

/**
 * Sign a supplier out. Clearing the cookie is the whole of it: the session is the signed cookie, and only the
 * supplier's own. A customer or staff session in the same browser is left alone.
 */
export async function POST() {
  return clearSupplierCookie(NextResponse.json({ ok: true }));
}
