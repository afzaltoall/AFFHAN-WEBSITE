import { prisma } from "@/lib/prisma";

/** The client, or a transaction's: what lib/lead-pool.ts and lib/cargo.ts pass around. */
type Db = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * A request marked Handled is at least "Checked" for its customer (the owner, 2026-11-02: "25 pending ... but there is
 * covered", of the console's Signed-in customers strip, where 17 of the 26 Pending were already marked Handled).
 *
 * Inquiry.status (the office's triage) and Inquiry.customerStatus (what a signed-in customer reads on their account)
 * stay two columns (lib/inquiry-status.ts), but they must not contradict each other: a request the office has handled
 * can no longer tell its customer "Pending: Our team will contact you shortly." The office set Checked by hand after
 * Handled 205 times; the 17 were the ones where that second click was missed. So every way of marking an inquiry
 * Handled calls this: the console's row and bulk buttons (/api/admin/inquiry/), its single-inquiry PATCH, and a
 * salesperson's Lead or No lead (closeOpenRequests in lib/lead-pool.ts). It moves a Pending one to Checked ("Our team
 * has reviewed your inquiry"), the least a handled request can truthfully say, which is why it may be done for many at
 * once where In Progress may not. Never In Progress or a custom message; nothing moves back when a request is set to
 * New again; Spam changes nothing. Only signed-in customers' requests: nobody else has a page that shows the status,
 * and the trail is theirs alone. Each move goes on the request's trail (InquiryStatusEvent) with who made it, as the
 * console's own control writes it. `by.id` is an AdminUser's id, or an Employee's for Lead or No lead.
 *
 * Returns the ids it moved. Inside `tx` when given (closeOpenRequests's transaction), else in one of its own.
 */
export async function checkHandledInquiries(
  ids: string[],
  by: { id: string | null; name: string | null },
  tx?: Db,
): Promise<string[]> {
  if (!ids.length) return [];
  const run = async (db: Db) => {
    const candidates = await db.inquiry.findMany({
      where: { id: { in: ids }, status: "handled", customerStatus: "PENDING", userId: { not: null } },
      select: { id: true },
    });
    const now = new Date();
    const moved: string[] = [];
    for (const { id } of candidates) {
      // One at a time, each only while it still says Pending, so a status somebody set a moment ago is never overwritten
      // and the trail never records a move that did not happen.
      const { count } = await db.inquiry.updateMany({
        where: { id, status: "handled", customerStatus: "PENDING" },
        data: { customerStatus: "CHECKED", statusUpdatedAt: now },
      });
      if (count) moved.push(id);
    }
    if (moved.length) {
      await db.inquiryStatusEvent.createMany({
        data: moved.map((inquiryId) => ({ inquiryId, fromStatus: "PENDING", toStatus: "CHECKED", changedById: by.id, changedByName: by.name, createdAt: now })),
      });
    }
    return moved;
  };
  return tx ? run(tx) : prisma.$transaction(run, { maxWait: 10_000, timeout: 20_000 });
}
