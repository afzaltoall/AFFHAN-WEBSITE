import { prisma } from "@/lib/prisma";
import { EMPLOYEE_IDLE_MS, readWorkspaceAuth } from "@/lib/employee-session";

export const dynamic = "force-dynamic";

/**
 * The staff landing page.
 *
 * Deliberately thin: phase 2 is authentication, and the assigned-leads view,
 * the status updates and the activity feed are phases 4 to 6. What it does show
 * is the state the sign-in produced — who you are, which account, when you were
 * last here — because that is what makes the auth testable by looking at it.
 */
export default async function EmployeeDashboardPage() {
  const auth = await readWorkspaceAuth();
  // The layout has already redirected anyone without a session; this is for
  // the type narrowing, and for the admin case, which has no Employee row.
  if (!auth.ok) return null;

  const employee =
    auth.kind === "employee"
      ? await prisma.employee.findUnique({
          where: { id: auth.employee.id },
          select: { name: true, email: true, role: true, region: true, lastLoginAt: true, createdAt: true },
        })
      : null;

  const minutes = Math.round(EMPLOYEE_IDLE_MS / 60000);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">
          {employee ? `Welcome, ${employee.name.split(" ")[0]}` : "Staff workspace"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {employee
            ? "Your assigned inquiries will appear here once lead assignment is switched on."
            : "You are signed in as an administrator. Employees see their assigned leads here."}
        </p>
      </div>

      {employee && (
        <dl className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
          {[
            ["Name", employee.name],
            ["Email", employee.email],
            ["Rank", employee.role],
            ["Region", employee.region ?? "—"],
            [
              "Last signed in",
              employee.lastLoginAt ? employee.lastLoginAt.toLocaleString("en-GB") : "first sign-in",
            ],
            ["Account created", employee.createdAt.toLocaleDateString("en-GB")],
          ].map(([label, value]) => (
            <div key={label} className="bg-white px-4 py-3">
              <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="text-xs text-slate-500">
        This session ends after {minutes} minutes without activity.
      </p>
    </div>
  );
}
