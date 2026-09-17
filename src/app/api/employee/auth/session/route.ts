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
 * The workspace calls this while someone is active, and each call re-signs the
 * cookie with a new issued-at — that is how "thirty minutes of inactivity"
 * slides. It cannot be used to grant extra time: the answer is computed from
 * the timestamp the server signed, so a client that keeps calling after the
 * window has closed is told the session is over, and a client that stops
 * calling simply lets it close.
 *
 * 401 with a reason, so the page can say "your session timed out" rather than
 * dumping someone at a login form with no explanation.
 */
export async function GET() {
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
