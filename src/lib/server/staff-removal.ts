import "server-only";
import { prisma } from "@/lib/prisma";
import { releaseDeactivated } from "@/lib/lead-pool";

/**
 * Delete from Employee tasks (the owner, 2026-11-03: "delete option"). An account that has done nothing yet, added by
 * mistake, is deleted, with its referral code. An account with any history is switched off instead, as the Staff
 * section's Deactivate does (app/api/admin/employees/[id], PATCH): signed out at once, what they held let go to the
 * pool, their link no longer counting, and everything they did kept, because their name is on the trail of every
 * customer they touched (Employee.isActive). History is anything that points at them: a sign-in, a status update, a
 * customer assigned or taken, the pool's trail, the cargo sheet, a trip referral or a payment.
 */
export async function removeEmployees(ids: string[], by: string): Promise<{ deleted: string[]; switchedOff: string[]; missing: number }> {
  const out = { deleted: [] as string[], switchedOff: [] as string[], missing: 0 };
  for (const id of [...new Set(ids)]) {
    const e = await prisma.employee.findUnique({ where: { id }, select: { id: true, name: true, isActive: true, lastLoginAt: true } });
    if (!e) {
      out.missing += 1;
      continue;
    }
    if (!e.lastLoginAt && !(await hasHistory(id))) {
      try {
        await prisma.employee.delete({ where: { id } });
        out.deleted.push(e.name);
        continue;
      } catch (error) {
        // Something pointed at them after all (a row written a moment ago): kept, and switched off below.
        console.error("employee delete fell back to switching off:", error instanceof Error ? error.name : "unknown");
      }
    }
    if (e.isActive) {
      await prisma.employee.update({ where: { id }, data: { isActive: false, tokenVersion: { increment: 1 } } });
      const held = { assignedToId: id, status: { not: "deleted" } };
      const letGo = { assignedToId: null, assignedAt: null };
      await Promise.all([
        prisma.inquiry.updateMany({ where: held, data: letGo }),
        prisma.contactMessage.updateMany({ where: held, data: letGo }),
        prisma.shipmentInquiry.updateMany({ where: held, data: letGo }),
      ]);
      await releaseDeactivated(id, by, new Date());
    }
    out.switchedOff.push(e.name);
  }
  return out;
}

/** Whether anything on record points at this employee. */
async function hasHistory(id: string): Promise<boolean> {
  const counts = await Promise.all([
    prisma.statusUpdate.count({ where: { employeeId: id } }),
    prisma.inquiry.count({ where: { assignedToId: id } }),
    prisma.contactMessage.count({ where: { assignedToId: id } }),
    prisma.shipmentInquiry.count({ where: { assignedToId: id } }),
    prisma.leadQueueEntry.count({ where: { OR: [{ currentEmployeeId: id }, { lastEmployeeId: id }] } }),
    prisma.leadQueueEvent.count({ where: { OR: [{ fromEmployeeId: id }, { toEmployeeId: id }] } }),
    prisma.cargoShipment.count({ where: { createdById: id } }),
    prisma.cargoEvent.count({ where: { createdById: id } }),
    prisma.cargoChange.count({ where: { byId: id } }),
    prisma.tripApplication.count({ where: { referrerId: id } }),
    prisma.tripReferralPayout.count({ where: { employeeId: id } }),
  ]);
  return counts.some((n) => n > 0);
}
