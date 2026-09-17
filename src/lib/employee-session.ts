import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  cookieOptions,
  readSession,
  SESSION_COOKIE,
  signSession,
  type SessionUser,
} from "@/lib/session";

// ---------------------------------------------------------------------------
// Employee sessions.
//
// The same signed cookie the admin console uses (lib/session.ts) — one cookie,
// one secret, one verification path — told apart by `role`. What is added here
// is everything that cookie does not carry on its own:
//
//   - an idle timeout that is actually enforced. The admin console's timeout is
//     AdminAutoLogout, a client component: real protection against a machine
//     left unlocked, none at all against anyone who simply does not run it.
//     Employee sessions are checked here, on the server, on every guarded
//     request, against the `iat` the cookie is signed with.
//   - a check that the employee still exists and is still active. Deactivating
//     somebody has to take effect now, not when their cookie happens to lapse.
//   - tokenVersion, for the same reason: bumping the column on the row makes
//     every cookie already issued for that employee fail the comparison, which
//     is how a password reset or a deactivation logs out the other devices.
//
// The last two cost one indexed lookup per guarded request. That is the price
// of "revoked means revoked", and it is the same query the page would make to
// show the employee's own name anyway.
// ---------------------------------------------------------------------------

export const EMPLOYEE_ROLE = "employee";

/** Thirty minutes with no request, and the session is over. */
export const EMPLOYEE_IDLE_MS = 30 * 60 * 1000;

/** What /employee/login sends people back to when the timeout is what ended it. */
export const EXPIRED_QUERY = "expired=1";

export interface EmployeeIdentity {
  id: string;
  email: string;
  name: string;
  /** ADMIN | EMPLOYEE — the employee's own rank, not the session role. */
  role: string;
  region: string | null;
  image: string | null;
}

export type EmployeeAuthFailure =
  | "no_session"
  | "not_employee"
  | "idle_expired"
  | "deactivated"
  | "stale_token";

export type EmployeeAuth =
  | { ok: true; employee: EmployeeIdentity; session: SessionUser }
  | { ok: false; reason: EmployeeAuthFailure };

/**
 * An employee session, or an admin one.
 *
 * /employee/* admits admins deliberately: the console's owner should be able to
 * see what the team sees. They are NOT given an employee identity, because
 * there is no Employee row behind an admin cookie — StatusUpdate.employeeId is
 * a foreign key, so anything that writes to the audit trail has to insist on
 * `kind === "employee"` rather than assume one is present.
 */
export type WorkspaceAuth =
  | { ok: true; kind: "employee"; employee: EmployeeIdentity; session: SessionUser }
  | { ok: true; kind: "admin"; session: SessionUser }
  | { ok: false; reason: EmployeeAuthFailure };

const IDENTITY_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  region: true,
  image: true,
  isActive: true,
  tokenVersion: true,
} as const;

/** The cookie value for a freshly-authenticated (or freshly-active) employee. */
export function signEmployeeSession(employee: {
  id: string;
  email: string;
  name: string;
  image: string | null;
  tokenVersion: number;
}): string {
  return signSession({
    id: employee.id,
    email: employee.email,
    name: employee.name,
    role: EMPLOYEE_ROLE,
    image: employee.image,
    tokenVersion: employee.tokenVersion,
  });
}

/**
 * Verify a cookie as an employee session.
 *
 * Order matters: signature, then role, then idle, then the row. Nothing reaches
 * the database until the cookie has proved it was issued by us and is still
 * inside its window.
 */
export async function authoriseEmployeeToken(token: string | undefined): Promise<EmployeeAuth> {
  const parsed = readSession(token);
  if (!parsed) return { ok: false, reason: "no_session" };
  if (parsed.user.role !== EMPLOYEE_ROLE) return { ok: false, reason: "not_employee" };

  // A cookie with no issued-at cannot be aged, so it is not trusted. (Nothing
  // signs one without it; this is the "forged or ancient" branch.)
  if (parsed.issuedAt === null) return { ok: false, reason: "idle_expired" };
  if (Date.now() - parsed.issuedAt > EMPLOYEE_IDLE_MS) return { ok: false, reason: "idle_expired" };

  const employee = await prisma.employee.findUnique({
    where: { id: parsed.user.id },
    select: IDENTITY_FIELDS,
  });
  if (!employee || !employee.isActive) return { ok: false, reason: "deactivated" };
  if ((parsed.user.tokenVersion ?? 0) !== employee.tokenVersion) {
    return { ok: false, reason: "stale_token" };
  }

  return {
    ok: true,
    session: parsed.user,
    employee: {
      id: employee.id,
      email: employee.email,
      name: employee.name,
      role: employee.role,
      region: employee.region,
      image: employee.image,
    },
  };
}

/** The current employee, from the request's cookies. */
export async function readEmployeeAuth(): Promise<EmployeeAuth> {
  const store = await cookies();
  return authoriseEmployeeToken(store.get(SESSION_COOKIE)?.value);
}

/** The current employee or admin, from the request's cookies. */
export async function readWorkspaceAuth(): Promise<WorkspaceAuth> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const parsed = readSession(token);
  if (!parsed) return { ok: false, reason: "no_session" };

  // Admins keep the console's own session rules, including its timeout. Ageing
  // them out here would sign an admin out of /admin by a rule written for
  // /employee.
  if (parsed.user.role === "admin") return { ok: true, kind: "admin", session: parsed.user };

  const auth = await authoriseEmployeeToken(token);
  return auth.ok
    ? { ok: true, kind: "employee", employee: auth.employee, session: auth.session }
    : auth;
}

/**
 * Slide the idle window forward.
 *
 * The window is "thirty minutes since the last request", so every authenticated
 * request re-signs the cookie with a new issued-at. A client that stops calling
 * simply stops extending — there is no way for one to grant itself longer than
 * the server is willing to give, because the server reads the timestamp it
 * signed, never one the page sends.
 */
export function refreshEmployeeCookie(
  res: NextResponse,
  employee: { id: string; email: string; name: string; image: string | null },
  tokenVersion: number
): NextResponse {
  res.cookies.set(
    SESSION_COOKIE,
    signEmployeeSession({ ...employee, tokenVersion }),
    { ...cookieOptions, maxAge: Math.floor(EMPLOYEE_IDLE_MS / 1000) }
  );
  return res;
}

/** Where to send someone whose session did not pass. */
export function loginRedirectFor(reason: EmployeeAuthFailure): string {
  switch (reason) {
    case "idle_expired":
      return `/employee/login/?${EXPIRED_QUERY}`;
    case "deactivated":
      return "/employee/login/?disabled=1";
    case "stale_token":
      return "/employee/login/?signedout=1";
    default:
      return "/employee/login/";
  }
}
