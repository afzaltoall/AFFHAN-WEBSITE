import { prisma } from "@/lib/prisma";
import { EMPLOYEE_IDLE_MS, readWorkspaceAuth } from "@/lib/employee-session";
import { leadStatusChip, leadStatusLabel } from "@/lib/leadStatus";
import { EmployeeLeadCard, type LeadCardData, type LeadUpdate } from "@/components/employee/EmployeeLeadCard";

export const dynamic = "force-dynamic";

/**
 * A member of staff's own work.
 *
 * Everything here is scoped by `assignedToId` in the query itself, not by
 * hiding rows after the fact: an employee is shown the leads handed to them
 * and has no route to anybody else's. Deleted rows are left out — a lead in
 * the console's Recently Deleted is not work.
 *
 * The cards carry what the console's own rows carry, photograph included,
 * because this is the whole of what somebody has before they pick up the
 * phone.
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
            phone: true, country: true, productName: true, quantity: true, message: true,
            // Only the image comes off the relation: `include: { product: true }`
            // would fetch every Product column for each row, as the console
            // once did.
            product: { select: { imageUrl: true } },
          },
        }),
        prisma.contactMessage.findMany({
          where: { assignedToId: employeeId, status: { not: "deleted" } },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            id: true, createdAt: true, fullName: true, companyName: true, email: true,
            phone: true, country: true, message: true,
          },
        }),
      ])
    : [[], []];

  // One query for the trail on every card, rather than one per card.
  const updates = employeeId && (inquiries.length || contacts.length)
    ? await prisma.statusUpdate.findMany({
        where: {
          OR: [
            { inquiryId: { in: inquiries.map((i) => i.id) } },
            { contactId: { in: contacts.map((c) => c.id) } },
          ],
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, status: true, note: true, createdAt: true, inquiryId: true, contactId: true,
          // A lead can change hands, so the trail can hold somebody else's
          // entries; the card names them when they are not the reader's.
          employee: { select: { id: true, name: true } },
        },
      })
    : [];

  const trail = new Map<string, LeadUpdate[]>();
  for (const u of updates) {
    const key = `${u.inquiryId ? "inquiry" : "contact"}:${u.inquiryId ?? u.contactId}`;
    const row: LeadUpdate = {
      id: u.id,
      status: u.status,
      note: u.note,
      createdAt: u.createdAt.toISOString(),
      byName: u.employee.name,
      byMe: u.employee.id === employeeId,
    };
    const list = trail.get(key);
    if (list) list.push(row); else trail.set(key, [row]);
  }

  const inquiryCards: LeadCardData[] = inquiries.map((i) => ({
    kind: "inquiry",
    id: i.id,
    createdAt: i.createdAt.toISOString(),
    title: i.productName,
    image: i.product?.imageUrl ?? null,
    customerName: i.customerName,
    companyName: i.companyName,
    country: i.country,
    phone: i.phone,
    email: i.email,
    quantity: i.quantity,
    message: i.message,
    updates: trail.get(`inquiry:${i.id}`) ?? [],
  }));

  const contactCards: LeadCardData[] = contacts.map((c) => ({
    kind: "contact",
    id: c.id,
    createdAt: c.createdAt.toISOString(),
    title: c.fullName,
    image: null,
    customerName: c.fullName,
    companyName: c.companyName,
    country: c.country,
    phone: c.phone,
    email: c.email,
    quantity: null,
    message: c.message,
    updates: trail.get(`contact:${c.id}`) ?? [],
  }));

  const total = inquiryCards.length + contactCards.length;
  const firstName = auth.kind === "employee" ? auth.employee.name.split(" ")[0] : null;
  const minutes = Math.round(EMPLOYEE_IDLE_MS / 60000);

  // What the reader has already said about their own leads, so the top of the
  // page answers "where am I" before they scroll.
  const tally = new Map<string, number>();
  for (const card of [...inquiryCards, ...contactCards]) {
    const latest = card.updates[0];
    tally.set(latest ? latest.status : "NONE", (tally.get(latest ? latest.status : "NONE") ?? 0) + 1);
  }

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

        {auth.kind === "employee" && total > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...tally.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([status, n]) => (
                <span
                  key={status}
                  className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                    status === "NONE" ? "bg-black/[0.05] text-slate-500" : leadStatusChip(status)
                  }`}
                >
                  {status === "NONE" ? "Not started" : leadStatusLabel(status)} · {n}
                </span>
              ))}
          </div>
        )}
      </div>

      {auth.kind === "employee" && (
        <>
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[15px] font-bold">Quote requests</h2>
              <span className="text-xs font-semibold text-slate-500">{inquiryCards.length}</span>
            </div>
            {inquiryCards.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                No quote requests assigned to you.
              </p>
            ) : (
              <ul className="space-y-3">
                {inquiryCards.map((lead) => (
                  <EmployeeLeadCard key={lead.id} lead={lead} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[15px] font-bold">Contact messages</h2>
              <span className="text-xs font-semibold text-slate-500">{contactCards.length}</span>
            </div>
            {contactCards.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                No contact messages assigned to you.
              </p>
            ) : (
              <ul className="space-y-3">
                {contactCards.map((lead) => (
                  <EmployeeLeadCard key={lead.id} lead={lead} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <p className="text-xs text-slate-500">
        Outcomes are recorded as a trail: each one is added, and nothing already written is changed.
        This session ends after {minutes} minutes without activity.
      </p>
    </div>
  );
}
