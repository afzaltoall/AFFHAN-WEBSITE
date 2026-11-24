import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { revealInstagramPassword } from "@/lib/server/instagram-task";
import { vaultOpenUntil } from "@/lib/server/instagram-vault";
import { instagramErrorResponse } from "@/lib/server/instagram-auth";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * One account's Instagram password, for an administrator whose vault is open (they typed their own password in the
 * last ten minutes; ../unlock/). A POST, never a GET: each read is written into the account's history with who read
 * it. Never cached. A tracker (HR) has no door here: the staff routes never answer with a password.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  if ((await vaultOpenUntil(admin)) === null) {
    return NextResponse.json({ error: "Type your password to see account passwords.", locked: true }, { status: 403, headers: NO_STORE });
  }
  const { id } = await params;
  try {
    const shown = await revealInstagramPassword({ kind: "admin", name: admin.name || admin.email || "Administrator" }, id);
    return NextResponse.json(shown, { headers: NO_STORE });
  } catch (e) {
    return instagramErrorResponse(e);
  }
}
