import { prisma } from "@/lib/prisma";
import { EMPLOYEE_IDLE_MS, readWorkspaceAuth } from "@/lib/employee-session";
import type { LeadCardData, LeadUpdate } from "@/components/employee/lead-types";
import { EmployeeLeadBoard } from "@/components/employee/EmployeeLeadBoard";
import { wt } from "@/components/employee/workspace-ui";

export const dynamic = "force-dynamic";

/**
 * The product's photographs, main one first and each once. allImages is JSON and
 * read defensively, as the product page reads it: an array of URL strings, or
 * nothing usable.
 */
function galleryOf(main: string | null, allImages: unknown): string[] {
  const rest = Array.isArray(allImages)
    ? allImages.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  return [...new Set([...(main ? [main] : []), ...rest])];
}

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
            // Only the photographs come off the relation: `include: { product:
            // true }` would fetch every Product column for each row, as the
            // console once did. productId is for the link to its page.
            productId: true,
            product: { select: { imageUrl: true, allImages: true } },
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
    // Somebody else's "Not attended" is not this person's business.
    //
    // A customer reaches a second salesperson because the first could not take
    // them on, and the whole point is that the second gets an ordinary lead —
    // not one carrying "two people passed on this" at the top of it, which
    // tells them what to think before they dial. It is dropped here, at the
    // source, so nothing downstream can show it: not the trail, not the chip
    // on the row, not the tiles, which all derive from these rows. Their own
    // entries stay — what you did yourself is not hidden from you — and the
    // admin's views (activity feed, staff page) read the table directly and
    // see every one of them.
    if (u.status === "NOT_ATTENDED" && u.employee.id !== employeeId) continue;
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
    images: galleryOf(i.product?.imageUrl ?? null, i.product?.allImages),
    productId: i.product ? i.productId : null,
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
    images: [],
    productId: null,
    customerName: c.fullName,
    companyName: c.companyName,
    country: c.country,
    phone: c.phone,
    email: c.email,
    quantity: null,
    message: c.message,
    updates: trail.get(`contact:${c.id}`) ?? [],
  }));

  const minutes = Math.round(EMPLOYEE_IDLE_MS / 60000);

  return (
    <div className="space-y-6">
      {auth.kind === "employee" ? (
        // Searching and filtering are the client's job; everything above is
        // already fetched, so narrowing it costs no round trip.
        <EmployeeLeadBoard
          leads={[...inquiryCards, ...contactCards].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )}
          name={auth.employee.name}
        />
      ) : (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Staff workspace</h1>
          <p className={`mt-0.5 text-[13px] ${wt.soft}`}>
            You are signed in as an administrator. Employees see the leads assigned to them here.
          </p>
        </div>
      )}

      <p className={`text-[11px] ${wt.soft}`}>
        Leads are grouped by the customer’s phone number, so everything one person asked about is on one
        row. An outcome is recorded against the customer and kept against each of their products, as a
        trail: each one is added, and nothing already written is changed.
        This session ends after {minutes} minutes without activity.
      </p>
    </div>
  );
}
