import { NextResponse } from "next/server";
import {
  EMPLOYEE_IDLE_MS,
  readEmployeeAuth,
  refreshEmployeeCookie,
} from "@/lib/employee-session";

export const dynamic = "force-dynamic";

/**
 * Who is signed in, and keep the session alive while they are working.
 *
 * Two verbs, because they are two questions and answering both with one call
 * is how an idle timeout quietly stops being one — a tab polling every minute
 * to notice the end would otherwise postpone it forever, which is what this
 * route did when GET was the only verb.
 *
 *   GET  — a check. Says nothing back to the cookie, so a workspace left open
 *          overnight ages out exactly on time.
 *   POST — a touch, sent while somebody is actually working. Re-signs the
 *          cookie with a new issued-at; that is how the window slides.
 *
 * Neither can buy extra time: the answer is computed from the timestamp the
 * server signed, so a client still posting after the window has closed is told
 * the session is over, and one that stops simply lets it close.
 *
 * 401 with a reason, so the page can say "your session timed out" rather than
 * dumping someone at a login form with no explanation.
 */
export async function GET() {
  const auth = await readEmployeeAuth();

  if (!auth.ok) {
    return NextResponse.json({ error: "Not signed in", reason: auth.reason }, { status: 401 });
  }

  return NextResponse.json({
    employee: auth.employee,
    idleTimeoutMs: EMPLOYEE_IDLE_MS,
  });
}

export async function POST() {
  const auth = await readEmployeeAuth();

  if (!auth.ok) {
    return NextResponse.json({ error: "Not signed in", reason: auth.reason }, { status: 401 });
  }

  const res = NextResponse.json({
    employee: auth.employee,
    idleTimeoutMs: EMPLOYEE_IDLE_MS,
  });
  return refreshEmployeeCookie(
    res,
    {
      id: auth.employee.id,
      email: auth.employee.email,
      name: auth.employee.name,
      image: auth.employee.image,
    },
    auth.session.tokenVersion ?? 0
  );
}
