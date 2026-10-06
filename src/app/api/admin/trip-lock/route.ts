import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { setTripLock, tripLock } from "@/lib/trip-lock";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

/** The trip's lock (lib/trip-lock.ts), for the console: as it stands, and who last changed it. */
export async function GET() {
  if (!(await requireAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  const lock = await tripLock({ fresh: true });
  if (lock.failed) return NextResponse.json({ error: "Could not read the lock." }, { status: 500 });
  return NextResponse.json(lock, { headers: { "Cache-Control": "no-store" } });
}

/**
 * { action: "unlock" } opens the trip: everyone on the homepage, or waiting
 * on a locked trip page, watches it open within seconds, and every page
 * served after it is open. { action: "lock" } closes it again for every visit
 * from then on. Admins only.
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
    // visitor should not get the page from before this change. Nor should
    // a search engine get the sitemap from before it (the trip's pages are
    // listed only while it is open). "layout": with trailingSlash the
    // sitemap is filed under "/sitemap.xml/", which revalidatePath trims to
    // a tag that misses it; its layout tag is the one that matches (seen in
    // its .meta, 2026-10-06).
    revalidatePath("/");
    revalidatePath("/sitemap.xml", "layout");
    return NextResponse.json(lock, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("trip lock change failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "That change did not save. Try again." }, { status: 500 });
  }
}
