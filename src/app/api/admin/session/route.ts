import { NextResponse } from "next/server";
import { ADMIN_IDLE_MS, readAdminSession, refreshAdminCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Whether the console still has a session, and the one place that extends one.
 *
 * Two verbs, because "is it still alive" and "keep it alive" are different
 * questions and answering both with one call is how an idle timeout quietly
 * stops being one: a tab that polls every minute to notice the end would
 * otherwise postpone it forever.
 *
 *   GET  — a check. Reads the session and says nothing back to the cookie, so a
 *          console left open overnight ages out exactly on time.
 *   POST — a touch. Re-signs the cookie with a new issued-at, which is what
 *          makes the window slide while somebody is actually working.
 *
 * Neither can buy extra time. The answer is computed from the timestamp the
 * server signed, so a page that keeps posting past the window is told the
 * session is over rather than granted a new one.
 */
export async function GET() {
  const auth = await readAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ error: "Not signed in", reason: auth.reason }, { status: 401 });
  }
  return NextResponse.json({
    admin: { id: auth.user.id, email: auth.user.email, name: auth.user.name },
    idleTimeoutMs: ADMIN_IDLE_MS,
  });
}

export async function POST() {
  const auth = await readAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ error: "Not signed in", reason: auth.reason }, { status: 401 });
  }
  return refreshAdminCookie(NextResponse.json({ ok: true, idleTimeoutMs: ADMIN_IDLE_MS }), auth.user);
}
