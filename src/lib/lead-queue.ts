import { prisma } from "@/lib/prisma";
import { customerKeyOf } from "@/lib/customerGroups";
import { addOfficeMinutes, isOfficeOpen } from "@/lib/office-hours";
import { formatDateTime } from "@/lib/datetime";
import { sendEmail } from "@/lib/email";
import { leadGivenUpEmail } from "@/lib/email-templates";
import { decideRotation, nextInOrder, type RotationMember } from "@/lib/lead-rotation-order";

/**
 * The rotation queue: a customer nobody has taken on, going round the team.
 *
 * A salesperson who cannot take a customer on records "Not attended". The
 * customer — every product they asked about and every message they sent —
 * leaves that person at once and is offered to the next one immediately.
 * There is no waiting period before a handover somebody has already asked for.
 *
 * From then on each holder has two working hours. Doing anything at all with
 * the customer stops that clock; silence hands them on again. The rotation
 * runs in office hours only, goes round the active team at most twice, and
 * then gives up: the customer is marked INVALID and stops moving, for an
 * administrator to look at.
 *
 * None of this is visible to the person holding the lead. To them it is an
 * ordinary lead that arrived — which is the point, and why there is no queue
 * flag on Inquiry and why other people's "Not attended" entries are hidden
 * from staff (see the dashboard query).
 */

/** Two working hours of silence and the customer moves on. */
export const SILENCE_MINUTES = 120;

/**
 * How many times the whole active team may be offered one customer.
 *
 * Two. The original request was a week of two-hourly rotation, which is 84
 * handovers; with five salespeople that is each of them being offered the same
 * customer seventeen times, having already declined it. Two passes is ten
 * offers with the team as it stands, which is enough to say the team has seen
 * it.
 */
export const MAX_PASSES = 2;

/** A week from entering: the backstop for anything the pass cap cannot reach. */
export const QUEUE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** How long a rotation run may hold an entry before another run may retry it. */
const CLAIM_LEASE_MS = 5 * 60 * 1000;

export const QUEUE_STATE = {
  ROTATING: "ROTATING",
  MANUAL: "MANUAL",
  RESOLVED: "RESOLVED",
  INVALID: "INVALID",
} as const;

/**
 * The client, or a transaction on it.
 *
 * Derived from the exported client rather than named as PrismaClient: this
 * project's client is $extends-ed with a retry (see lib/prisma.ts), which is a
 * different type. Taking the model methods off it and leaving the lifecycle
 * ones behind is what makes one function work with both.
 */
type Db = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

type PoolMember = RotationMember;

/** One lead, as the queue refers to it. */
export interface LeadRef {
  kind: "inquiry" | "contact";
  id: string;
}

/**
 * Who a customer may be handed to, in the order they are handed to.
 *
 * Active employees oldest first, the id breaking ties so the order is the same
 * on every run and in every process. Deliberately not a stored index: people
 * are deactivated and added, and a number pointing into a list that has since
 * changed is a number pointing at the wrong person. The entry remembers WHO
 * held it last, and the next one is worked out against the pool as it is now.
 */
export async function activePool(db: Db = prisma): Promise<PoolMember[]> {
  return db.employee.findMany({
    where: { isActive: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
}

/**
 * Who has already been offered this customer since the current pass began.
 *
 * Read back from the trail rather than kept as a list on the entry, so there
 * is one account of what happened and not two that can disagree. Both ends of
 * each event count: the person who declined it is as much "already asked" as
 * the person it went to.
 */
async function seenThisPass(db: Db, entryId: string): Promise<Set<string>> {
  // Both of these start a pass: finishing the last one, and a customer being
  // declined again after they had left the queue altogether. Without RESUMED
  // in this list a returning customer would inherit the old cycle's "everyone
  // has already been asked" and be given up on at the first sweep.
  const lastPass = await db.leadQueueEvent.findFirst({
    where: { entryId, kind: { in: ["PASS_COMPLETE", "RESUMED"] } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const events = await db.leadQueueEvent.findMany({
    where: { entryId, ...(lastPass ? { createdAt: { gt: lastPass.createdAt } } : {}) },
    select: { fromEmployeeId: true, toEmployeeId: true },
  });
  const seen = new Set<string>();
  for (const e of events) {
    if (e.fromEmployeeId) seen.add(e.fromEmployeeId);
    if (e.toEmployeeId) seen.add(e.toEmployeeId);
  }
  return seen;
}

/** Every live lead belonging to a customer: quote requests and messages both. */
async function customerLeads(db: Db, customerKey: string) {
  const [inquiries, contacts] = await Promise.all([
    db.inquiry.findMany({ where: { customerKey, status: { not: "deleted" } }, select: { id: true } }),
    db.contactMessage.findMany({ where: { customerKey, status: { not: "deleted" } }, select: { id: true } }),
  ]);
  return { inquiries: inquiries.map((r) => r.id), contacts: contacts.map((r) => r.id), count: inquiries.length + contacts.length };
}

/** Hand every one of a customer's leads to somebody, or to nobody. */
async function assignCustomer(db: Db, customerKey: string, employeeId: string | null, now: Date) {
  const data = { assignedToId: employeeId, assignedAt: employeeId ? now : null };
  await Promise.all([
    db.inquiry.updateMany({ where: { customerKey, status: { not: "deleted" } }, data }),
    db.contactMessage.updateMany({ where: { customerKey, status: { not: "deleted" } }, data }),
  ]);
}

async function logEvent(
  db: Db,
  entryId: string,
  kind: string,
  extra: { from?: PoolMember | null; to?: PoolMember | null; note?: string } = {}
) {
  await db.leadQueueEvent.create({
    data: {
      entryId,
      kind,
      fromEmployeeId: extra.from?.id ?? null,
      fromName: extra.from?.name ?? null,
      toEmployeeId: extra.to?.id ?? null,
      toName: extra.to?.name ?? null,
      note: extra.note ?? null,
    },
  });
}

/** The customer key shared by a set of leads, or null if they have none. */
export async function keyForLeads(db: Db, leads: LeadRef[]): Promise<string | null> {
  const inquiryIds = leads.filter((l) => l.kind === "inquiry").map((l) => l.id);
  const contactIds = leads.filter((l) => l.kind === "contact").map((l) => l.id);
  const [inquiries, contacts] = await Promise.all([
    inquiryIds.length
      ? db.inquiry.findMany({ where: { id: { in: inquiryIds } }, select: { customerKey: true, phone: true, email: true } })
      : Promise.resolve([]),
    contactIds.length
      ? db.contactMessage.findMany({ where: { id: { in: contactIds } }, select: { customerKey: true, phone: true, email: true } })
      : Promise.resolve([]),
  ]);
  for (const row of [...inquiries, ...contacts]) {
    // The stored key first; failing that the rule that produces it, so a row
    // written before the column existed still finds its customer.
    const key = row.customerKey ?? customerKeyOf(row);
    if (key) return key;
  }
  return null;
}

interface AdvanceResult {
  outcome: "ROTATED" | "PARKED" | "INVALID" | "GONE";
  to?: PoolMember | null;
  passes: number;
  note?: string;
}

/** What a handover will be, worked out before anything is written. */
interface AdvancePlan {
  gone: boolean;
  decision: ReturnType<typeof decideRotation> | null;
  leaving: PoolMember | null;
  leavingId: string | null;
  poolSize: number;
}

type QueueEntryShape = {
  id: string; customerKey: string; currentEmployeeId: string | null;
  lastEmployeeId: string | null; passes: number; handoffs: number;
};

/**
 * Work out where a customer goes next — every read, and no writes.
 *
 * Deliberately outside the transaction that then applies it. The first version
 * did the lot inside one, and it failed in testing with P2028: ten round trips
 * to a database that sleeps when idle does not fit in Prisma's five-second
 * interactive-transaction budget, and the customer silently stayed where they
 * were. Reads here, writes there.
 *
 * The cost is that the team could change between planning and applying — one
 * more person deactivated in the same second — and a customer could be handed
 * to somebody who has just left. The next sweep moves them on again, which is
 * a smaller problem than a handover that does not happen at all.
 */
async function planAdvance(
  db: Db,
  entry: QueueEntryShape,
  decliner: PoolMember | null,
  /** A customer returning to a queue they had left: nobody has been asked yet. */
  freshCycle = false
): Promise<AdvancePlan> {
  const leads = await customerLeads(db, entry.customerKey);
  if (leads.count === 0) return { gone: true, decision: null, leaving: null, leavingId: null, poolSize: 0 };

  const pool = await activePool(db);
  // On a fresh cycle the RESUMED event that would mark the boundary has not
  // been written yet — this is still the planning half — so the old cycle's
  // events are skipped here rather than filtered afterwards.
  const seen = freshCycle ? new Set<string>() : await seenThisPass(db, entry.id);
  const leaving = decliner ?? (entry.currentEmployeeId ? pool.find((p) => p.id === entry.currentEmployeeId) ?? null : null);
  const leavingId = decliner?.id ?? entry.currentEmployeeId;
  if (leavingId) seen.add(leavingId);

  // The decision itself is somewhere else and has nothing to do with the
  // database — see lib/lead-rotation-order.ts.
  const decision = decideRotation({
    pool,
    lastEmployeeId: entry.lastEmployeeId ?? entry.currentEmployeeId,
    leavingId,
    seen,
    passes: entry.passes,
    maxPasses: MAX_PASSES,
  });
  return { gone: false, decision, leaving, leavingId, poolSize: pool.length };
}

/**
 * Carry the plan out: the writes, together, or not at all.
 *
 * Assigning the leads and recording who holds them have to be one act. If the
 * first succeeded and the second did not, the customer would be sitting with
 * somebody the queue does not know about, and the next sweep would hand them
 * to a second person who also thinks they own them.
 */
async function applyAdvance(
  db: Db,
  entry: QueueEntryShape,
  plan: AdvancePlan,
  now: Date
): Promise<AdvanceResult> {
  if (plan.gone) {
    // Every lead deleted or moved to another customer: there is nothing left
    // to hand over, and an empty entry should not keep cycling.
    await db.leadQueueEntry.update({
      where: { id: entry.id },
      data: { state: QUEUE_STATE.RESOLVED, closedAt: now, closedReason: "GONE", nextRotationAt: null, currentEmployeeId: null },
    });
    await logEvent(db, entry.id, "CLOSED", { note: "no leads left for this customer" });
    return { outcome: "GONE", passes: entry.passes };
  }

  const { decision, leaving, leavingId } = plan;
  if (!decision) return { outcome: "GONE", passes: entry.passes };

  if (decision.passCompleted) {
    await logEvent(db, entry.id, "PASS_COMPLETE", {
      note: `offered to the whole team (${plan.poolSize}) ${decision.passes}×`,
    });
  }

  if (decision.action === "park") {
    await assignCustomer(db, entry.customerKey, null, now);
    await db.leadQueueEntry.update({
      where: { id: entry.id },
      data: {
        currentEmployeeId: null,
        lastEmployeeId: leavingId ?? entry.lastEmployeeId,
        nextRotationAt: null,
        passes: decision.passes,
      },
    });
    await logEvent(db, entry.id, "PARKED", { from: leaving, note: decision.reason });
    return { outcome: "PARKED", passes: decision.passes, note: decision.reason };
  }

  if (decision.action === "invalid") {
    await assignCustomer(db, entry.customerKey, null, now);
    await db.leadQueueEntry.update({
      where: { id: entry.id },
      data: {
        state: QUEUE_STATE.INVALID, passes: decision.passes, closedAt: now, closedReason: "INVALID",
        nextRotationAt: null, currentEmployeeId: null, lastEmployeeId: leavingId ?? entry.lastEmployeeId,
      },
    });
    await logEvent(db, entry.id, "INVALIDATED", {
      from: leaving,
      note: `no outcome after ${decision.passes} passes through the team`,
    });
    return { outcome: "INVALID", passes: decision.passes };
  }

  await assignCustomer(db, entry.customerKey, decision.to.id, now);
  await db.leadQueueEntry.update({
    where: { id: entry.id },
    data: {
      state: QUEUE_STATE.ROTATING,
      currentEmployeeId: decision.to.id,
      lastEmployeeId: leavingId ?? entry.lastEmployeeId,
      handoffs: entry.handoffs + 1,
      passes: decision.passes,
      nextRotationAt: addOfficeMinutes(now, SILENCE_MINUTES),
      closedAt: null,
      closedReason: null,
    },
  });
  await logEvent(db, entry.id, entry.handoffs === 0 ? "ENTERED" : "ROTATED", { from: leaving, to: decision.to });
  return { outcome: "ROTATED", to: decision.to, passes: decision.passes };
}

/**
 * Somebody could not take this customer on. Hand them straight over.
 *
 * Called the moment "Not attended" is recorded — not two hours later. The
 * office confirmed this: there is no reason to leave a customer waiting once a
 * salesperson has already said they cannot help them.
 */
export async function declineCustomer(opts: {
  leads: LeadRef[];
  employeeId: string;
  employeeName: string;
  now?: Date;
}): Promise<AdvanceResult | { outcome: "NO_KEY" }> {
  const now = opts.now ?? new Date();
  const key = await keyForLeads(prisma, opts.leads);
  if (!key) return { outcome: "NO_KEY" };

  // Everything that only reads, before the transaction opens.
  const existing = await prisma.leadQueueEntry.findUnique({ where: { customerKey: key } });
  const name =
    (await prisma.inquiry.findFirst({ where: { customerKey: key }, orderBy: { createdAt: "desc" }, select: { customerName: true } }))?.customerName ??
    (await prisma.contactMessage.findFirst({ where: { customerKey: key }, orderBy: { createdAt: "desc" }, select: { fullName: true } }))?.fullName ??
    "Customer";

  // A customer who was in the queue before and left it starts a new cycle
  // rather than continuing the old one, so the counters go back to zero.
  const reopening = Boolean(existing && existing.state !== QUEUE_STATE.ROTATING);
  const entry = existing ?? { id: "", customerKey: key, currentEmployeeId: null, lastEmployeeId: null, passes: 0, handoffs: 0 };
  const plan = await planAdvance(
    prisma,
    reopening ? { ...entry, passes: 0, handoffs: 0, currentEmployeeId: null, lastEmployeeId: null } : entry,
    { id: opts.employeeId, name: opts.employeeName },
    reopening
  );

  return prisma.$transaction(async (tx) => {
    let row = existing;
    if (!row) {
      row = await tx.leadQueueEntry.create({
        data: {
          customerKey: key, customerName: name, state: QUEUE_STATE.ROTATING,
          enteredAt: now, expiresAt: new Date(now.getTime() + QUEUE_LIFETIME_MS),
        },
      });
    } else if (reopening) {
      row = await tx.leadQueueEntry.update({
        where: { id: row.id },
        data: {
          state: QUEUE_STATE.ROTATING, customerName: name, enteredAt: now,
          expiresAt: new Date(now.getTime() + QUEUE_LIFETIME_MS),
          passes: 0, handoffs: 0, closedAt: null, closedReason: null, nextRotationAt: null,
        },
      });
      await logEvent(tx, row.id, "RESUMED", { note: "declined again after leaving the queue" });
    }
    return applyAdvance(tx, { ...row, handoffs: reopening ? 0 : row.handoffs, passes: reopening ? 0 : row.passes }, plan, now);
  });
}

/**
 * Somebody is working this customer, or has decided about them.
 *
 * "Working it" stops the clock — the two hours are a silence timer, not a
 * deadline, and a lead being actively worked must not be taken off the person
 * working it. A decision closes the entry outright.
 */
export async function touchCustomer(opts: {
  leads: LeadRef[];
  employeeId: string;
  employeeName: string;
  status: string;
  now?: Date;
}): Promise<"held" | "resolved" | "none"> {
  const now = opts.now ?? new Date();
  const key = await keyForLeads(prisma, opts.leads);
  if (!key) return "none";
  const entry = await prisma.leadQueueEntry.findUnique({ where: { customerKey: key } });
  if (!entry || entry.state !== QUEUE_STATE.ROTATING) return "none";

  if (opts.status === "LEAD" || opts.status === "NO_LEAD") {
    await prisma.leadQueueEntry.update({
      where: { id: entry.id },
      data: { state: QUEUE_STATE.RESOLVED, closedAt: now, closedReason: "RESOLVED", nextRotationAt: null },
    });
    await logEvent(prisma, entry.id, "RESOLVED", {
      from: { id: opts.employeeId, name: opts.employeeName },
      note: opts.status === "LEAD" ? "became business" : "declined by the customer",
    });
    return "resolved";
  }

  // IN_PROGRESS, or anything else a person records: they are on it.
  if (entry.nextRotationAt !== null) {
    await prisma.leadQueueEntry.update({ where: { id: entry.id }, data: { nextRotationAt: null } });
    await logEvent(prisma, entry.id, "HELD", {
      to: { id: opts.employeeId, name: opts.employeeName },
      note: "picked up — the silence timer stops",
    });
  }
  return "held";
}

/**
 * An administrator has taken over: the queue lets go.
 *
 * Assigning a queued customer by hand is a decision about who works them, and
 * the rotation must not undo it two hours later.
 */
export async function manualAssignCustomers(opts: {
  leads: LeadRef[];
  employeeId: string | null;
  now?: Date;
}): Promise<number> {
  const now = opts.now ?? new Date();
  const keys = new Set<string>();
  const inquiryIds = opts.leads.filter((l) => l.kind === "inquiry").map((l) => l.id);
  const contactIds = opts.leads.filter((l) => l.kind === "contact").map((l) => l.id);
  const [inquiries, contacts] = await Promise.all([
    inquiryIds.length ? prisma.inquiry.findMany({ where: { id: { in: inquiryIds } }, select: { customerKey: true } }) : Promise.resolve([]),
    contactIds.length ? prisma.contactMessage.findMany({ where: { id: { in: contactIds } }, select: { customerKey: true } }) : Promise.resolve([]),
  ]);
  for (const row of [...inquiries, ...contacts]) if (row.customerKey) keys.add(row.customerKey);
  if (keys.size === 0) return 0;

  const entries = await prisma.leadQueueEntry.findMany({
    where: { customerKey: { in: [...keys] }, state: QUEUE_STATE.ROTATING },
    select: { id: true },
  });
  for (const entry of entries) {
    await prisma.leadQueueEntry.update({
      where: { id: entry.id },
      data: {
        state: QUEUE_STATE.MANUAL, closedAt: now, closedReason: "MANUAL",
        nextRotationAt: null, currentEmployeeId: opts.employeeId,
      },
    });
    await logEvent(prisma, entry.id, "MANUAL_ASSIGN", {
      note: opts.employeeId ? "assigned by an administrator" : "unassigned by an administrator",
    });
  }
  return entries.length;
}

/**
 * An administrator hands a queued customer to somebody, by name.
 *
 * Every lead of theirs moves, as it does everywhere else in this module, and
 * the rotation lets go: this is now a decision somebody made, not a customer
 * going round. Passing null takes the customer off everybody, which is how an
 * administrator parks one deliberately.
 */
export async function assignQueuedCustomer(opts: {
  entryId: string;
  employeeId: string | null;
  now?: Date;
}): Promise<{ customerName: string; to: string | null; leads: number }> {
  const now = opts.now ?? new Date();
  const entry = await prisma.leadQueueEntry.findUniqueOrThrow({ where: { id: opts.entryId } });
  const to = opts.employeeId
    ? await prisma.employee.findUnique({ where: { id: opts.employeeId }, select: { id: true, name: true } })
    : null;
  const leads = await customerLeads(prisma, entry.customerKey);

  await prisma.$transaction(async (tx) => {
    await assignCustomer(tx, entry.customerKey, to?.id ?? null, now);
    await tx.leadQueueEntry.update({
      where: { id: entry.id },
      data: {
        state: QUEUE_STATE.MANUAL,
        currentEmployeeId: to?.id ?? null,
        lastEmployeeId: entry.currentEmployeeId ?? entry.lastEmployeeId,
        nextRotationAt: null,
        closedAt: now,
        closedReason: "MANUAL",
      },
    });
    await logEvent(tx, entry.id, "MANUAL_ASSIGN", {
      to,
      note: to ? "assigned by an administrator" : "taken off everybody by an administrator",
    });
  });

  return { customerName: entry.customerName, to: to?.name ?? null, leads: leads.count };
}

/**
 * Put a customer the queue gave up on back into it.
 *
 * A fresh cycle, not a continuation: the counters go back to zero and the week
 * starts again, because an administrator sending a customer round a second
 * time means "try again", not "carry on from where you stopped". The RESUMED
 * event is also what tells the rotation that nobody has been asked yet — see
 * seenThisPass.
 *
 * Due immediately, so the next sweep picks it up rather than the customer
 * waiting two more working hours to be offered to anybody.
 */
export async function requeueCustomer(opts: { entryId: string; now?: Date }): Promise<{ customerName: string }> {
  const now = opts.now ?? new Date();
  const entry = await prisma.leadQueueEntry.findUniqueOrThrow({ where: { id: opts.entryId } });

  await prisma.$transaction(async (tx) => {
    await tx.leadQueueEntry.update({
      where: { id: entry.id },
      data: {
        state: QUEUE_STATE.ROTATING,
        passes: 0,
        handoffs: 0,
        enteredAt: now,
        expiresAt: new Date(now.getTime() + QUEUE_LIFETIME_MS),
        nextRotationAt: now,
        closedAt: null,
        closedReason: null,
      },
    });
    await logEvent(tx, entry.id, "RESUMED", { note: "put back into the rotation by an administrator" });
  });

  return { customerName: entry.customerName };
}

export interface RotationReport {
  at: string;
  officeOpen: boolean;
  dryRun: boolean;
  due: number;
  rotated: { customer: string; to: string; passes: number }[];
  parked: string[];
  invalidated: string[];
  closed: string[];
  expired: number;
  keysFilled: number;
  wouldRotate?: { customer: string; to: string | null }[];
}

/**
 * One sweep: what the cron actually does.
 *
 * Every step is safe to run twice. Entries are claimed with a short lease
 * before they are touched, so two runs overlapping — the scheduler and a hand
 * -run, say — cannot hand the same customer to two people; and if a run dies
 * mid-sweep the lease expires and the next one picks the entry up.
 */
export async function runRotation(opts: { now?: Date; dryRun?: boolean } = {}): Promise<RotationReport> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? false;
  const report: RotationReport = {
    at: now.toISOString(),
    officeOpen: isOfficeOpen(now),
    dryRun,
    due: 0,
    rotated: [],
    parked: [],
    invalidated: [],
    closed: [],
    expired: 0,
    keysFilled: 0,
  };

  // 1. A lead with no customer key cannot be found by the queue. The API
  //    routes set it and the backfill filled the rest; this is the net under
  //    both of them, for rows written by a script or restored from a backup.
  if (!dryRun) report.keysFilled = await fillMissingKeys();

  // 2. The week-long backstop, whatever the hour: marking a dead customer
  //    INVALID hands nothing to anybody, so it need not wait for the office.
  const stale = await prisma.leadQueueEntry.findMany({
    where: { state: QUEUE_STATE.ROTATING, expiresAt: { lte: now } },
    select: { id: true, customerKey: true, customerName: true, passes: true, handoffs: true, enteredAt: true },
    take: 100,
  });
  for (const entry of stale) {
    if (dryRun) { report.expired += 1; continue; }
    await assignCustomer(prisma, entry.customerKey, null, now);
    await prisma.leadQueueEntry.update({
      where: { id: entry.id },
      data: { state: QUEUE_STATE.INVALID, closedAt: now, closedReason: "INVALID", nextRotationAt: null, currentEmployeeId: null },
    });
    await logEvent(prisma, entry.id, "INVALIDATED", { note: "a week in the queue with no outcome" });
    // Outside the loop's writes, and after them: a customer nobody took on is
    // a state with no witness unless somebody is told.
    await announceGivenUp(entry);
    report.expired += 1;
    report.invalidated.push(entry.customerName);
  }

  // 3. Handovers, in office hours only. Outside them the sweep still runs —
  //    it is how the expiries above happen — but nothing is handed to anybody
  //    who is not at work.
  const due = await prisma.leadQueueEntry.findMany({
    where: { state: QUEUE_STATE.ROTATING, nextRotationAt: { lte: now } },
    orderBy: { nextRotationAt: "asc" },
    take: 100,
  });
  report.due = due.length;

  if (!report.officeOpen) return report;

  if (dryRun) {
    const pool = await activePool();
    report.wouldRotate = [];
    for (const entry of due) {
      const seen = await seenThisPass(prisma, entry.id);
      if (entry.currentEmployeeId) seen.add(entry.currentEmployeeId);
      const next = nextInOrder(pool, entry.lastEmployeeId ?? entry.currentEmployeeId, seen, entry.currentEmployeeId);
      report.wouldRotate.push({ customer: entry.customerName, to: next?.name ?? null });
    }
    return report;
  }

  for (const entry of due) {
    // Claim it: another run that reads this entry a moment later finds its
    // rotation due in five minutes rather than now, and leaves it alone.
    const claimed = await prisma.leadQueueEntry.updateMany({
      where: { id: entry.id, state: QUEUE_STATE.ROTATING, nextRotationAt: { lte: now } },
      data: { nextRotationAt: new Date(now.getTime() + CLAIM_LEASE_MS) },
    });
    if (claimed.count !== 1) continue;

    // Read, decide, then write — the writes alone inside the transaction. See
    // planAdvance for why the whole thing in one did not survive contact with
    // a database that sleeps.
    const plan = await planAdvance(prisma, entry, null);
    const result = await prisma.$transaction((tx) => applyAdvance(tx, entry, plan, now));
    if (result.outcome === "ROTATED") report.rotated.push({ customer: entry.customerName, to: result.to?.name ?? "?", passes: result.passes });
    else if (result.outcome === "PARKED") report.parked.push(entry.customerName);
    else if (result.outcome === "INVALID") {
      report.invalidated.push(entry.customerName);
      // After the transaction has committed, never inside it: a mail server
      // having a bad afternoon must not roll a customer back into a rotation
      // that has already given up on them.
      await announceGivenUp(entry);
    }
    else if (result.outcome === "GONE") report.closed.push(entry.customerName);
  }

  return report;
}

/**
 * Tell the office a customer has been given up on.
 *
 * INVALID is the one state in this whole feature that nobody is watching: the
 * customer stops moving, stops being anybody's work, and waits for somebody to
 * open the Queue page. So it is the one state that reaches out.
 *
 * Sent to every active administrator, because "the admin" is not one person
 * and a notification nobody receives is the problem it was meant to solve.
 * Failures are logged and swallowed — an email that does not send must not
 * roll back a customer's state, which would leave them rotating forever.
 */
async function announceGivenUp(entry: { customerKey: string; customerName: string; passes: number; handoffs: number; enteredAt: Date }) {
  try {
    const [admins, inquiries, contacts] = await Promise.all([
      prisma.adminUser.findMany({ select: { email: true } }),
      prisma.inquiry.count({ where: { customerKey: entry.customerKey, status: { not: "deleted" } } }),
      prisma.contactMessage.count({ where: { customerKey: entry.customerKey, status: { not: "deleted" } } }),
    ]);
    if (admins.length === 0) return;

    const body = leadGivenUpEmail({
      customerName: entry.customerName,
      products: inquiries,
      messages: contacts,
      passes: entry.passes,
      handoffs: entry.handoffs,
      enteredAt: formatDateTime(entry.enteredAt),
    });
    for (const admin of admins) {
      const sent = await sendEmail({ ...body, to: admin.email });
      if (!sent.ok) console.warn(`[queue] could not tell an administrator about ${entry.customerName}: ${sent.reason ?? "unknown"}`);
    }
  } catch (error) {
    console.error("queue notification failed:", error instanceof Error ? error.name : "unknown");
  }
}

/** Fill Inquiry/ContactMessage.customerKey wherever it is missing. */
async function fillMissingKeys(limit = 500): Promise<number> {
  let filled = 0;
  const [inquiries, contacts] = await Promise.all([
    prisma.inquiry.findMany({ where: { customerKey: null }, select: { id: true, phone: true, email: true }, take: limit }),
    prisma.contactMessage.findMany({ where: { customerKey: null }, select: { id: true, phone: true, email: true }, take: limit }),
  ]);
  for (const row of inquiries) {
    const key = customerKeyOf(row);
    if (!key) continue;
    await prisma.inquiry.update({ where: { id: row.id }, data: { customerKey: key } });
    filled += 1;
  }
  for (const row of contacts) {
    const key = customerKeyOf(row);
    if (!key) continue;
    await prisma.contactMessage.update({ where: { id: row.id }, data: { customerKey: key } });
    filled += 1;
  }
  return filled;
}
