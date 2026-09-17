import { prisma } from "@/lib/prisma";
import { EMPLOYEE_IDLE_MS, readWorkspaceAuth } from "@/lib/employee-session";
import { timeAgo } from "@/lib/relative-time";

export const dynamic = "force-dynamic";

/**
 * A member of staff's own work.
 *
 * Everything here is scoped by `assignedToId` in the query itself, not by
 * hiding rows after the fact: an employee is shown the leads handed to them
 * and has no route to anybody else's. Deleted rows are left out — a lead in
 * the console's Recently Deleted is not work.
 *
 * Read-only for now. Recording an outcome against a lead is phase 5; this
 * page is what makes phase 4's assignment mean something.
 */
export default async function EmployeeDashboardPage() {
  const auth = await readWorkspaceAuth();
  // The layout has already turned away anyone without a session; this narrows
  // the type, and covers the admin case, which has no Employee row behind it.
  if (!auth.ok) return null;

  const employeeId = auth.kind === "employee" ? auth.employee.id : null;

  const [inquiries, contacts] = employeeId
    ? await Promise.all([
        prisma.inquiry.findMany({
          where: { assignedToId: employeeId, status: { not: "deleted" } },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            id: true, createdAt: true, customerName: true, companyName: true, email: true,
            phone: true, country: true, productName: true, quantity: true, message: true, status: true,
          },
        }),
        prisma.contactMessage.findMany({
          where: { assignedToId: employeeId, status: { not: "deleted" } },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            id: true, createdAt: true, fullName: true, companyName: true, email: true,
            phone: true, country: true, message: true, status: true,
          },
        }),
      ])
    : [[], []];

  const minutes = Math.round(EMPLOYEE_IDLE_MS / 60000);
  const total = inquiries.length + contacts.length;
  const firstName = auth.kind === "employee" ? auth.employee.name.split(" ")[0] : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">
          {firstName ? `Welcome, ${firstName}` : "Staff workspace"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {auth.kind !== "employee"
            ? "You are signed in as an administrator. Employees see the leads assigned to them here."
            : total === 0
              ? "Nothing is assigned to you yet. Leads appear here as soon as an administrator hands one over."
              : `${total} ${total === 1 ? "lead is" : "leads are"} assigned to you.`}
        </p>
      </div>

      {auth.kind === "employee" && (
        <>
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[15px] font-bold">Quote requests</h2>
              <span className="text-xs font-semibold text-slate-500">{inquiries.length}</span>
            </div>
            {inquiries.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                No quote requests assigned to you.
              </p>
            ) : (
              <ul className="space-y-2">
                {inquiries.map((i) => (
                  <li key={i.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold leading-snug">{i.productName}</p>
                      <span className="text-xs text-slate-500" title={i.createdAt.toLocaleString("en-GB")}>
                        {timeAgo(i.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {i.customerName}
                      {i.companyName ? ` · ${i.companyName}` : ""} · {i.country} · qty {i.quantity}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {i.phone}
                      {i.email ? ` · ${i.email}` : ""}
                    </p>
                    {i.message && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{i.message}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[15px] font-bold">Contact messages</h2>
              <span className="text-xs font-semibold text-slate-500">{contacts.length}</span>
            </div>
            {contacts.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                No contact messages assigned to you.
              </p>
            ) : (
              <ul className="space-y-2">
                {contacts.map((c) => (
                  <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold leading-snug">
                        {c.fullName}
                        {c.companyName ? <span className="font-normal text-slate-500"> · {c.companyName}</span> : null}
                      </p>
                      <span className="text-xs text-slate-500" title={c.createdAt.toLocaleString("en-GB")}>
                        {timeAgo(c.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {c.phone || "no phone"} · {c.email} {c.country ? `· ${c.country}` : ""}
                    </p>
                    <p className="mt-2 line-clamp-3 text-sm text-slate-600">{c.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <p className="text-xs text-slate-500">
        Recording an outcome against a lead arrives in the next phase. This session ends after{" "}
        {minutes} minutes without activity.
      </p>
    </div>
  );
}
