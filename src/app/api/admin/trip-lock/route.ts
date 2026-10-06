import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { setTripLock, tripLock } from "@/lib/trip-lock";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

/** The homepage trip banner's lock, for the console: as it stands, and who last changed it. */
export async function GET() {
  if (!(await requireAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  const lock = await tripLock({ fresh: true });
  if (lock.failed) return NextResponse.json({ error: "Could not read the lock." }, { status: 500 });
  return NextResponse.json(lock, { headers: { "Cache-Control": "no-store" } });
}

/**
 * { action: "unlock" } opens the banner: everyone on the homepage watches
 * it open within seconds, and every page served after it is open.
 * { action: "lock" } locks it again for every visit from then on. Admins
 * only.
 */
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return new NextResponse("Unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== "unlock" && body.action !== "lock") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  try {
    const lock = await setTripLock(body.action, admin.email);
    // The homepage is cached for a minute (ISR, revalidate = 60): the next
    // visitor should not get the page from before this change.
    revalidatePath("/");
    return NextResponse.json(lock, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("trip lock change failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "That change did not save. Try again." }, { status: 500 });
  }
}
