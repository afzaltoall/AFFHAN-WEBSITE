import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { customerKeyOf } from "@/lib/customerGroups";
import { customerCodesFor, ensureCodeForKey, issueMissingCodes } from "@/lib/customerCode";
import { isOfficeOpen, officeMinutesBetween } from "@/lib/office-hours";
import { formatDateTime } from "@/lib/datetime";
import { sendEmail } from "@/lib/email";
import { poolGivenUpEmail } from "@/lib/email-templates";
import { MAX_OPEN_LEADS, RELEASE_REASON_MAX } from "@/lib/lead-pool-config";
import {
  AUTO_RELEASE_REASON, LEAVE_KINDS, POOL_EVENT, POOL_STATE, SETTLED_TRIAGE, closedByNote, firstName, isFinalOutcome,
  needsHandling, placeOnFile, poolKindLabel, releaseDeadline, retakeAllowedFrom, staleDeadline, triageMove, weekEnds,
} from "@/lib/lead-pool-rules";
import { normalizeStatus } from "@/lib/leadStatus";

/**
 * The open pool: customers nobody holds, which the sales team take for themselves.
 *
 * A new quote request, contact message or freight request arrives unassigned, and its customer (one customerKey:
 * every request and message of theirs) waits in the pool. Anyone may Take a customer, all of them at once, while
 * they hold fewer than MAX_OPEN_LEADS open customers; the claim is one conditional update, so two people pressing
 * Take together get one winner and one "Already taken". From then on:
 *
 *   - nothing recorded within two office hours of taking, and the customer goes back to the pool;
 *   - In progress, then two office days with nothing newer, and they go back too ("stale in progress");
 *   - Not attended, or the holder's own Release, puts them back at once;
 *   - whoever a customer left one of those ways may not take them again until the next office day;
 *   - a customer still unhandled a week after first arriving in the pool is Invalid, as before.
 *
 * A returning customer's new request joins whoever holds them, or their place in the pool, and restarts no clock.
 * Administrators hand nobody out (the owner, 2026-10-22): their one control is Release to pool on the Queue page, for
 * a held customer whose holder is away, and deactivating somebody releases everything they hold. Every move is
 * written to the trail (LeadQueueEvent), which /admin/activity, the staff pages and Team Performance read.
 *
 * Only customers with something to handle are in the pool or held (the owner, 2026-10-22): one whose every request
 * is marked Handled, Spam or deleted in the console is set aside as Done, nobody's and on no clock, at the switch,
 * the moment the console marks their last request, or at the next sweep; a new request, or one marked New again,
 * puts them back in the pool for a new week (reconsiderTriage). Lead or No lead closes the customer's open requests,
 * marked Handled with "closed by" the person on the trail (closeOpenRequests), and while somebody holds a customer an
 * administrator may not mark their requests Handled: the holder closes them (heldAmong). The owner's, 2026-10-22.
 *
 * No table is new. LeadQueueEntry, one row per customer since the rotation queue, is the customer's place in the
 * pool: state OPEN or HELD (or RESOLVED, DONE, INVALID), currentEmployeeId the holder, nextRotationAt the moment a
 * taken customer goes back if nothing is recorded, enteredAt and expiresAt their week. The rotation that used those
 * columns to hand customers round the team is gone.
 */

type Db = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export type LeadKind = "inquiry" | "contact" | "shipment";

/** One lead, as the pool refers to it. */
export interface LeadRef {
  kind: LeadKind;
  id: string;
}

interface Person {
  id: string;
  name: string;
}

const LIVE = { status: { not: "deleted" } };
const KIND_LABEL: Record<LeadKind, string> = { inquiry: "quote request", contact: "message", shipment: "freight request" };
const TX = { maxWait: 10_000, timeout: 20_000 };
const NEW_STATES: string[] = Object.values(POOL_STATE);

async function logEvent(
  db: Db,
  entryId: string,
  kind: string,
  extra: { from?: Person | null; to?: Person | null; note?: string | null } = {},
  at?: Date,
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
      ...(at ? { createdAt: at } : {}),
    },
  });
}

/** Hand every live lead of a customer to somebody, or to nobody. */
async function assignAll(db: Db, customerKey: string, employeeId: string | null, now: Date) {
  const where = { customerKey, ...LIVE };
  const data = { assignedToId: employeeId, assignedAt: employeeId ? now : null };
  await db.inquiry.updateMany({ where, data });
  await db.contactMessage.updateMany({ where, data });
  await db.shipmentInquiry.updateMany({ where, data });
}

/** The customer key shared by a set of leads, or null if they have none. */
export async function keyForLeads(db: Db, leads: LeadRef[]): Promise<string | null> {
  const ids = (kind: LeadKind) => leads.filter((l) => l.kind === kind).map((l) => l.id);
  const select = { customerKey: true, phone: true, email: true } as const;
  const [inquiries, contacts, shipments] = await Promise.all([
    ids("inquiry").length ? db.inquiry.findMany({ where: { id: { in: ids("inquiry") } }, select }) : Promise.resolve([]),
    ids("contact").length ? db.contactMessage.findMany({ where: { id: { in: ids("contact") } }, select }) : Promise.resolve([]),
    ids("shipment").length ? db.shipmentInquiry.findMany({ where: { id: { in: ids("shipment") } }, select }) : Promise.resolve([]),
  ]);
  for (const row of [...inquiries, ...contacts, ...shipments]) {
    // The stored key first; failing that the rule that produces it, for a row written before the column existed.
    const key = row.customerKey ?? customerKeyOf(row);
    if (key) return key;
  }
  return null;
}

/** The name a customer is filed under: their newest request's. For the console's own views only. */
async function customerNameFor(db: Db, key: string): Promise<string> {
  const [i, c, s] = await Promise.all([
    db.inquiry.findFirst({ where: { customerKey: key }, orderBy: { createdAt: "desc" }, select: { customerName: true, createdAt: true } }),
    db.contactMessage.findFirst({ where: { customerKey: key }, orderBy: { createdAt: "desc" }, select: { fullName: true, createdAt: true } }),
    db.shipmentInquiry.findFirst({ where: { customerKey: key }, orderBy: { createdAt: "desc" }, select: { customerName: true, createdAt: true } }),
  ]);
  const named = [
    i ? { name: i.customerName, at: i.createdAt } : null,
    c ? { name: c.fullName, at: c.createdAt } : null,
    s ? { name: s.customerName, at: s.createdAt } : null,
  ].filter((x): x is { name: string; at: Date } => Boolean(x && x.name));
  named.sort((a, b) => b.at.getTime() - a.at.getTime());
  return named[0]?.name ?? "Customer";
}

async function personOf(db: Db, id: string | null): Promise<Person | null> {
  if (!id) return null;
  return db.employee.findUnique({ where: { id }, select: { id: true, name: true } });
}

// ---- arrival ---------------------------------------------------------------------------------------------------------

/**
 * A quote request, message or freight request has just been saved. Its customer gets their AFFHAN number, and the
 * new request goes where the customer already is: to whoever holds them, or to their place in the pool, or into the
 * pool as a new customer. No clock restarts for a customer already held or waiting.
 *
 * A customer coming back after an outcome stays with the person who reached it, on a fresh two-hour clock, since
 * the new request is new work for them; one coming back after being given up on returns to the pool for a new week.
 *
 * Never throws: the caller is a customer's own form, and a pool that cannot be updated must not cost them their
 * request. The sweep takes in anybody this missed.
 */
export async function leadArrived(lead: { kind: LeadKind; id: string; customerKey: string | null; createdAt: Date }, now = new Date()): Promise<void> {
  if (!lead.customerKey) return;
  const key = lead.customerKey;
  try {
    await ensureCodeForKey(key, lead.createdAt, `pool:${lead.kind}`);
    const what = `a new ${KIND_LABEL[lead.kind]}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const entry = await prisma.leadQueueEntry.findUnique({ where: { customerKey: key } });
      if (!entry) {
        try {
          await prisma.$transaction(async (tx) => {
            const created = await tx.leadQueueEntry.create({
              data: {
                customerKey: key,
                customerName: await customerNameFor(tx, key),
                state: POOL_STATE.OPEN,
                enteredAt: now,
                expiresAt: weekEnds(now),
              },
            });
            await logEvent(tx, created.id, POOL_EVENT.OPENED, { note: what });
          }, TX);
          return;
        } catch (error) {
          // Two requests from one new customer at once: the other one opened the entry. Join it instead.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
          throw error;
        }
      }

      if (entry.state === POOL_STATE.HELD && entry.currentEmployeeId) {
        const holder = await personOf(prisma, entry.currentEmployeeId);
        await prisma.$transaction(async (tx) => {
          await assignOne(tx, lead, entry.currentEmployeeId!, now);
          await logEvent(tx, entry.id, POOL_EVENT.JOINED, { to: holder, note: `${what} joined the person holding them` });
        }, TX);
        return;
      }
      if (entry.state === POOL_STATE.OPEN) {
        await logEvent(prisma, entry.id, POOL_EVENT.JOINED, { note: `${what} joined their place in the pool` });
        return;
      }
      // Back after an outcome or after being given up on.
      const holder = entry.state === POOL_STATE.RESOLVED ? await personOf(prisma, entry.currentEmployeeId) : null;
      await prisma.$transaction(async (tx) => {
        if (holder) {
          await assignAll(tx, key, holder.id, now);
          await tx.leadQueueEntry.update({
            where: { id: entry.id },
            data: { state: POOL_STATE.HELD, nextRotationAt: releaseDeadline(now), closedAt: null, closedReason: null },
          });
          await logEvent(tx, entry.id, POOL_EVENT.JOINED, { to: holder, note: `${what} after an outcome: back with the same person` });
        } else {
          await assignAll(tx, key, null, now);
          await tx.leadQueueEntry.update({
            where: { id: entry.id },
            data: {
              state: POOL_STATE.OPEN, currentEmployeeId: null, nextRotationAt: null, closedAt: null, closedReason: null,
              enteredAt: now, expiresAt: weekEnds(now),
            },
          });
          await logEvent(tx, entry.id, POOL_EVENT.REOPENED, { note: `${what}: back in the pool for a new week` });
        }
      }, TX);
      return;
    }
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    console.error("pool arrival failed:", error instanceof Error ? error.name : "unknown", code ?? "");
  }
}

async function assignOne(db: Db, lead: LeadRef, employeeId: string, now: Date) {
  const data = { assignedToId: employeeId, assignedAt: now };
  if (lead.kind === "inquiry") await db.inquiry.update({ where: { id: lead.id }, data });
  else if (lead.kind === "contact") await db.contactMessage.update({ where: { id: lead.id }, data });
  else await db.shipmentInquiry.update({ where: { id: lead.id }, data });
}

// ---- the pool, as staff see it ------------------------------------------------------------------------------------------

/** One request of a pooled customer: what it is, never who sent it. */
export interface PoolItem {
  kind: LeadKind;
  /** The product's title for a quote request; none for a message or a freight request. */
  title: string | null;
  image: string | null;
  quantity: number | null;
  country: string;
  receivedAt: string;
}

/** A customer in the pool. `id` is their place in it (never the customer key, which is their phone number). */
export interface PoolRow {
  id: string;
  code: string | null;
  country: string;
  receivedAt: string;
  waitingSince: string;
  items: PoolItem[];
  counts: Record<LeadKind, number>;
  /** When the reader may take this customer again, if they let them go too recently. */
  retakeFrom: string | null;
}

export interface PoolView {
  rows: PoolRow[];
  /** How many open customers the reader holds, and how many they may. */
  held: number;
  cap: number;
  /** When it was read: the "today" the received times are written against, the same on the server and in the browser. */
  at: string;
}

/**
 * The pool for one member of staff: every customer nobody holds, newest request first.
 *
 * Only what the pool may show is ever read: the customer's AFFHAN number, the products' titles and photographs,
 * quantities, country, when each request arrived and what kind it is. No name, number, email, company or message is
 * selected here, so none can reach the page or the API; tests/security/lead-pool-privacy.test.mjs reads this.
 */
export async function listPool(employeeId: string | null, now = new Date()): Promise<PoolView> {
  const entries = await prisma.leadQueueEntry.findMany({
    where: { state: POOL_STATE.OPEN },
    select: { id: true, customerKey: true, enteredAt: true },
    take: 2000,
  });
  const held = employeeId ? await prisma.leadQueueEntry.count({ where: { state: POOL_STATE.HELD, currentEmployeeId: employeeId } }) : 0;
  if (entries.length === 0) return { rows: [], held, cap: MAX_OPEN_LEADS, at: now.toISOString() };

  const keys = entries.map((e) => e.customerKey);
  const where = { customerKey: { in: keys }, ...LIVE };
  const [inquiries, contacts, shipments, codes, left] = await Promise.all([
    prisma.inquiry.findMany({
      where,
      select: { customerKey: true, productName: true, quantity: true, country: true, createdAt: true, product: { select: { imageUrl: true } } },
    }),
    prisma.contactMessage.findMany({ where, select: { customerKey: true, country: true, createdAt: true } }),
    prisma.shipmentInquiry.findMany({ where, select: { customerKey: true, country: true, createdAt: true } }),
    customerCodesFor(keys),
    employeeId
      ? prisma.leadQueueEvent.findMany({
          where: { entryId: { in: entries.map((e) => e.id) }, fromEmployeeId: employeeId, kind: { in: [...LEAVE_KINDS] }, createdAt: { gte: new Date(now.getTime() - 9 * 86_400_000) } },
          orderBy: { createdAt: "desc" },
          select: { entryId: true, createdAt: true },
        })
      : Promise.resolve([] as { entryId: string; createdAt: Date }[]),
  ]);

  const items = new Map<string, PoolItem[]>();
  const add = (key: string | null, item: PoolItem) => {
    if (!key) return;
    const list = items.get(key);
    if (list) list.push(item);
    else items.set(key, [item]);
  };
  for (const i of inquiries) add(i.customerKey, { kind: "inquiry", title: i.productName, image: i.product?.imageUrl ?? null, quantity: i.quantity, country: i.country, receivedAt: i.createdAt.toISOString() });
  for (const c of contacts) add(c.customerKey, { kind: "contact", title: null, image: null, quantity: null, country: c.country, receivedAt: c.createdAt.toISOString() });
  for (const s of shipments) add(s.customerKey, { kind: "shipment", title: null, image: null, quantity: null, country: s.country, receivedAt: s.createdAt.toISOString() });

  const lastLeft = new Map<string, Date>();
  for (const l of left) if (!lastLeft.has(l.entryId)) lastLeft.set(l.entryId, l.createdAt);

  const rows: PoolRow[] = [];
  for (const e of entries) {
    const list = (items.get(e.customerKey) ?? []).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    if (list.length === 0) continue;
    const leftAt = lastLeft.get(e.id);
    const retake = leftAt ? retakeAllowedFrom(leftAt) : null;
    rows.push({
      id: e.id,
      code: codes[e.customerKey] ?? null,
      country: list[0].country,
      receivedAt: list[0].receivedAt,
      waitingSince: e.enteredAt.toISOString(),
      items: list,
      counts: {
        inquiry: list.filter((x) => x.kind === "inquiry").length,
        contact: list.filter((x) => x.kind === "contact").length,
        shipment: list.filter((x) => x.kind === "shipment").length,
      },
      retakeFrom: retake && retake > now ? retake.toISOString() : null,
    });
  }
  rows.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return { rows, held, cap: MAX_OPEN_LEADS, at: now.toISOString() };
}

// ---- Take ---------------------------------------------------------------------------------------------------------------

export type TakeResult =
  /** `leads`: every request and message now theirs, so the board can open the customer. */
  | { outcome: "taken"; code: string | null; leads: LeadRef[] }
  | { outcome: "already"; by: string }
  | { outcome: "cap"; held: number; cap: number }
  | { outcome: "cooldown"; until: string }
  | { outcome: "gone" };

/**
 * Take a customer from the pool: every live request of theirs, at once.
 *
 * The claim itself is one conditional update of the customer's entry, from OPEN with nobody holding it to HELD by
 * the taker. Two people pressing Take together both send it; Postgres locks the row for the first, and the second
 * finds it no longer OPEN and changes nothing, so exactly one wins and the other is told who did. The cap is checked
 * in the same transaction under a lock of the taker's own, so one person's two quick Takes cannot both slip under
 * it. Someone the customer left (Release, auto-release, Not attended) waits until the next office day.
 */
export async function takeCustomer(opts: { entryId: string; employee: Person; now?: Date }): Promise<TakeResult> {
  const now = opts.now ?? new Date();
  const me = opts.employee;
  const entry = await prisma.leadQueueEntry.findUnique({
    where: { id: opts.entryId },
    select: { id: true, customerKey: true, state: true, currentEmployee: { select: { name: true } } },
  });
  if (!entry) return { outcome: "gone" };
  if (entry.state === POOL_STATE.HELD) return { outcome: "already", by: firstName(entry.currentEmployee?.name) };
  if (entry.state !== POOL_STATE.OPEN) return { outcome: "gone" };

  const left = await prisma.leadQueueEvent.findFirst({
    where: { entryId: entry.id, fromEmployeeId: me.id, kind: { in: [...LEAVE_KINDS] } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (left) {
    const from = retakeAllowedFrom(left.createdAt);
    if (now < from) return { outcome: "cooldown", until: from.toISOString() };
  }

  const result = await prisma.$transaction(async (tx): Promise<TakeResult> => {
    // One taker at a time per person, so the count below cannot go stale before the claim.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`pool-take:${me.id}`}))`;
    const held = await tx.leadQueueEntry.count({ where: { state: POOL_STATE.HELD, currentEmployeeId: me.id } });
    if (held >= MAX_OPEN_LEADS) return { outcome: "cap", held, cap: MAX_OPEN_LEADS };

    const claimed = await tx.leadQueueEntry.updateMany({
      where: { id: entry.id, state: POOL_STATE.OPEN, currentEmployeeId: null },
      data: {
        state: POOL_STATE.HELD, currentEmployeeId: me.id, nextRotationAt: releaseDeadline(now),
        handoffs: { increment: 1 }, closedAt: null, closedReason: null,
      },
    });
    if (claimed.count !== 1) {
      const now2 = await tx.leadQueueEntry.findUnique({ where: { id: entry.id }, select: { currentEmployee: { select: { name: true } } } });
      return { outcome: "already", by: firstName(now2?.currentEmployee?.name) };
    }
    await assignAll(tx, entry.customerKey, me.id, now);
    await logEvent(tx, entry.id, POOL_EVENT.TAKEN, { to: me });
    return { outcome: "taken", code: null, leads: [] };
  }, TX);

  if (result.outcome === "taken") {
    const where = { customerKey: entry.customerKey, assignedToId: me.id, ...LIVE };
    const [codes, i, c, s] = await Promise.all([
      customerCodesFor([entry.customerKey]),
      prisma.inquiry.findMany({ where, select: { id: true } }),
      prisma.contactMessage.findMany({ where, select: { id: true } }),
      prisma.shipmentInquiry.findMany({ where, select: { id: true } }),
    ]);
    const leads: LeadRef[] = [
      ...i.map((r) => ({ kind: "inquiry" as const, id: r.id })),
      ...c.map((r) => ({ kind: "contact" as const, id: r.id })),
      ...s.map((r) => ({ kind: "shipment" as const, id: r.id })),
    ];
    return { outcome: "taken", code: codes[entry.customerKey] ?? null, leads };
  }
  return result;
}

// ---- letting go -----------------------------------------------------------------------------------------------------------

/**
 * Back to the pool, from the person holding the customer: their Release button, or their Not attended. Only the
 * holder can do it; anyone else is told the lead is not theirs. The week keeps running from first arrival.
 */
export async function releaseCustomer(opts: {
  leads: LeadRef[];
  employee: Person;
  kind: typeof POOL_EVENT.RELEASED | typeof POOL_EVENT.NOT_ATTENDED;
  reason?: string | null;
  now?: Date;
}): Promise<{ outcome: "released"; entryId: string } | { outcome: "not-yours" }> {
  const now = opts.now ?? new Date();
  const key = await keyForLeads(prisma, opts.leads);
  if (!key) return { outcome: "not-yours" };
  const entry = await prisma.leadQueueEntry.findUnique({ where: { customerKey: key }, select: { id: true, state: true, currentEmployeeId: true } });
  if (!entry || entry.state !== POOL_STATE.HELD || entry.currentEmployeeId !== opts.employee.id) return { outcome: "not-yours" };
  const reason = (opts.reason ?? "").trim().slice(0, RELEASE_REASON_MAX) || null;

  const done = await prisma.$transaction(async (tx) => {
    const moved = await tx.leadQueueEntry.updateMany({
      where: { id: entry.id, state: POOL_STATE.HELD, currentEmployeeId: opts.employee.id },
      data: { state: POOL_STATE.OPEN, currentEmployeeId: null, lastEmployeeId: opts.employee.id, nextRotationAt: null },
    });
    if (moved.count !== 1) return false;
    await assignAll(tx, key, null, now);
    await logEvent(tx, entry.id, opts.kind, { from: opts.employee, note: reason });
    return true;
  }, TX);
  return done ? { outcome: "released", entryId: entry.id } : { outcome: "not-yours" };
}

/**
 * The holder recorded something other than Not attended: In progress stops the release clock; Lead or No lead
 * decides the customer, who stays with them.
 */
export async function touchCustomer(opts: { leads: LeadRef[]; employee: Person; status: string; now?: Date }): Promise<"held" | "resolved" | "none"> {
  const now = opts.now ?? new Date();
  const key = await keyForLeads(prisma, opts.leads);
  if (!key) return "none";
  const entry = await prisma.leadQueueEntry.findUnique({ where: { customerKey: key } });
  if (!entry || entry.currentEmployeeId !== opts.employee.id) return "none";
  if (entry.state !== POOL_STATE.HELD && entry.state !== POOL_STATE.RESOLVED) return "none";

  const status = normalizeStatus(opts.status);
  if (status === "LEAD" || status === "NO_LEAD") {
    await prisma.leadQueueEntry.update({
      where: { id: entry.id },
      data: { state: POOL_STATE.RESOLVED, closedAt: now, closedReason: "RESOLVED", nextRotationAt: null },
    });
    await logEvent(prisma, entry.id, POOL_EVENT.RESOLVED, { from: opts.employee, note: status === "LEAD" ? "became business" : "declined by the customer" });
    return "resolved";
  }
  if (entry.state === POOL_STATE.RESOLVED || entry.nextRotationAt !== null) {
    await prisma.leadQueueEntry.update({ where: { id: entry.id }, data: { state: POOL_STATE.HELD, nextRotationAt: null, closedAt: null, closedReason: null } });
    await logEvent(prisma, entry.id, POOL_EVENT.HELD, { to: opts.employee, note: "recorded In progress: the release clock stops" });
  }
  return "held";
}

/**
 * Lead or No lead closes the customer's open requests (the owner, 2026-10-22): every quote request, message and
 * freight request of theirs not yet marked Handled, Spam or deleted is marked Handled in the console, and the trail
 * says who closed them. Called after touchCustomer has decided them, so the triage leaves them decided rather than
 * setting them aside. Returns how many it marked.
 */
export async function closeOpenRequests(opts: { leads: LeadRef[]; employee: Person }): Promise<number> {
  const key = await keyForLeads(prisma, opts.leads);
  const ids = (kind: LeadKind) => opts.leads.filter((l) => l.kind === kind).map((l) => l.id);
  // Every request of the customer's, and the ones recorded against by id, in case one was filed before keys existed.
  const where = (kind: LeadKind) => ({
    status: { notIn: [...SETTLED_TRIAGE] },
    OR: [{ id: { in: ids(kind) } }, ...(key ? [{ customerKey: key }] : [])],
  });
  const data = { status: "handled" };
  return prisma.$transaction(async (tx) => {
    const marked =
      (await tx.inquiry.updateMany({ where: where("inquiry"), data })).count +
      (await tx.contactMessage.updateMany({ where: where("contact"), data })).count +
      (await tx.shipmentInquiry.updateMany({ where: where("shipment"), data })).count;
    const entry = marked > 0 && key ? await tx.leadQueueEntry.findUnique({ where: { customerKey: key }, select: { id: true } }) : null;
    if (entry) await logEvent(tx, entry.id, POOL_EVENT.REQUESTS_CLOSED, { from: opts.employee, note: closedByNote(opts.employee.name, marked) });
    return marked;
  }, TX);
}

// ---- administrators -----------------------------------------------------------------------------------------------------

/**
 * An administrator's one control over who holds whom (the owner's call, 2026-10-22): a held customer back to the
 * pool, for when the person holding them is away. Administrators no longer hand customers to anybody; staff take
 * them. It is logged as the administrator's doing, so it puts no cooldown on the holder, and a week that has already
 * run out starts again, or the next sweep would give the customer up at once.
 */
export async function adminRelease(opts: { entryId: string; by: string; now?: Date }): Promise<{ ok: boolean }> {
  const now = opts.now ?? new Date();
  const entry = await prisma.leadQueueEntry.findUnique({
    where: { id: opts.entryId },
    select: { id: true, customerKey: true, state: true, currentEmployeeId: true, expiresAt: true },
  });
  if (!entry || entry.state !== POOL_STATE.HELD) return { ok: false };
  const holder = await personOf(prisma, entry.currentEmployeeId);
  const done = await prisma.$transaction(async (tx) => {
    const moved = await tx.leadQueueEntry.updateMany({
      where: { id: entry.id, state: POOL_STATE.HELD, currentEmployeeId: entry.currentEmployeeId },
      data: {
        state: POOL_STATE.OPEN, currentEmployeeId: null, lastEmployeeId: entry.currentEmployeeId, nextRotationAt: null,
        ...(entry.expiresAt <= now ? { enteredAt: now, expiresAt: weekEnds(now) } : {}),
      },
    });
    if (moved.count !== 1) return false;
    await assignAll(tx, entry.customerKey, null, now);
    await logEvent(tx, entry.id, POOL_EVENT.ADMIN_UNASSIGNED, { from: holder, note: `released to the pool by ${opts.by}` });
    return true;
  }, TX);
  return { ok: done };
}

/**
 * Somebody deactivated keeps nothing: every customer they hold goes back to the pool, each with a line on the trail.
 * Their leads are let go by the caller (the employee route).
 */
export async function releaseDeactivated(employeeId: string, by: string, now = new Date()): Promise<number> {
  const person = await personOf(prisma, employeeId);
  const entries = await prisma.leadQueueEntry.findMany({
    where: { currentEmployeeId: employeeId, state: { in: [POOL_STATE.HELD, POOL_STATE.RESOLVED] } },
    select: { id: true, state: true, expiresAt: true },
  });
  for (const e of entries) {
    await prisma.leadQueueEntry.update({
      where: { id: e.id },
      data: e.state === POOL_STATE.HELD
        ? {
            state: POOL_STATE.OPEN, currentEmployeeId: null, lastEmployeeId: employeeId, nextRotationAt: null,
            ...(e.expiresAt <= now ? { enteredAt: now, expiresAt: weekEnds(now) } : {}),
          }
        : { currentEmployeeId: null, lastEmployeeId: employeeId },
    });
    if (e.state === POOL_STATE.HELD) await logEvent(prisma, e.id, POOL_EVENT.ADMIN_UNASSIGNED, { from: person, note: `${person?.name ?? "the holder"} was deactivated by ${by}` });
  }
  return entries.length;
}

// ---- the console's triage -------------------------------------------------------------------------------------------------

/** Of these customers, the ones with at least one request the console has not marked Handled, Spam or deleted. */
async function keysNeedingHandling(keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const settled = [...SETTLED_TRIAGE];
  const rows = await prisma.$queryRaw<{ k: string }[]>`
    SELECT DISTINCT k FROM (
      SELECT "customerKey" AS k FROM "Inquiry" WHERE "customerKey" = ANY(${keys}) AND status <> ALL(${settled})
      UNION SELECT "customerKey" FROM "ContactMessage" WHERE "customerKey" = ANY(${keys}) AND status <> ALL(${settled})
      UNION SELECT "customerKey" FROM "ShipmentInquiry" WHERE "customerKey" = ANY(${keys}) AND status <> ALL(${settled})
    ) x`;
  return new Set(rows.map((r) => r.k));
}

/**
 * Of these customers, the ones somebody holds, and who: an administrator may not mark them Handled (the owner,
 * 2026-10-22). The holder closes them, by recording Lead or No lead; Spam and delete still end the hold.
 */
export async function heldAmong(keys: string[]): Promise<{ customerKey: string; holder: string | null }[]> {
  if (keys.length === 0) return [];
  const rows = await prisma.leadQueueEntry.findMany({
    where: { customerKey: { in: keys }, state: POOL_STATE.HELD },
    select: { customerKey: true, currentEmployee: { select: { name: true } } },
  });
  return rows.map((r) => ({ customerKey: r.customerKey, holder: r.currentEmployee?.name ?? null }));
}

/** The customers behind some of the console's rows: read before it changes them, since a purge removes the rows. */
export async function customerKeysOf(kind: LeadKind, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const where = { id: { in: ids } };
  const select = { customerKey: true } as const;
  const rows =
    kind === "inquiry"
      ? await prisma.inquiry.findMany({ where, select })
      : kind === "contact"
        ? await prisma.contactMessage.findMany({ where, select })
        : await prisma.shipmentInquiry.findMany({ where, select });
  return [...new Set(rows.map((r) => r.customerKey).filter((k): k is string => Boolean(k)))];
}

export interface TriageMoves {
  /** Out of the pool, or out of somebody's hands: nothing left to handle. */
  setAside: string[];
  /** Back into the pool for a new week: something to handle again. */
  reopened: string[];
}

/**
 * The console's triage, applied to customers the pool already knows (the owner, 2026-10-22). One in the pool, or held
 * by somebody, whose every request is now marked Handled, Spam or deleted is set aside as Done: nobody's (their
 * requests are let go), on no clock, never auto-released or given up on. One set aside who has a request to deal
 * with again (marked New, or restored from Recently Deleted) goes back into the pool for a new week. Decided and
 * given-up customers stay as they are.
 *
 * The console's routes call it as they change a request's status, so it happens at once; the sweep calls it for
 * anything they missed. `by` names the administrator on the trail.
 */
export async function reconsiderTriage(keys: string[], opts: { now?: Date; by?: string | null; dryRun?: boolean } = {}): Promise<TriageMoves> {
  const now = opts.now ?? new Date();
  const out: TriageMoves = { setAside: [], reopened: [] };
  const unique = [...new Set(keys.filter(Boolean))];
  if (unique.length === 0) return out;
  const [entries, needing] = await Promise.all([
    prisma.leadQueueEntry.findMany({
      where: { customerKey: { in: unique }, state: { in: [POOL_STATE.OPEN, POOL_STATE.HELD, POOL_STATE.DONE] } },
      select: { id: true, customerKey: true, customerName: true, state: true, currentEmployeeId: true },
    }),
    keysNeedingHandling(unique),
  ]);
  const marked = opts.by ? ` (marked by ${opts.by})` : "";
  for (const e of entries) {
    const move = triageMove(e.state, needing.has(e.customerKey));
    if (!move) continue;
    if (opts.dryRun) {
      (move === "set-aside" ? out.setAside : out.reopened).push(e.customerName);
      continue;
    }
    if (move === "set-aside") {
      const holder = await personOf(prisma, e.currentEmployeeId);
      const moved = await prisma.$transaction(async (tx) => {
        const changed = await tx.leadQueueEntry.updateMany({
          where: { id: e.id, state: e.state, currentEmployeeId: e.currentEmployeeId },
          data: {
            state: POOL_STATE.DONE, currentEmployeeId: null, nextRotationAt: null, closedAt: now, closedReason: "HANDLED",
            ...(e.currentEmployeeId ? { lastEmployeeId: e.currentEmployeeId } : {}),
          },
        });
        if (changed.count !== 1) return false;
        await assignAll(tx, e.customerKey, null, now);
        await logEvent(tx, e.id, POOL_EVENT.DONE, { from: holder, note: `every request marked Handled, Spam or deleted${marked}: out of the pool` });
        return true;
      }, TX);
      if (moved) out.setAside.push(e.customerName);
    } else {
      const moved = await prisma.$transaction(async (tx) => {
        const changed = await tx.leadQueueEntry.updateMany({
          where: { id: e.id, state: POOL_STATE.DONE },
          data: {
            state: POOL_STATE.OPEN, currentEmployeeId: null, nextRotationAt: null, closedAt: null, closedReason: null,
            enteredAt: now, expiresAt: weekEnds(now),
          },
        });
        if (changed.count !== 1) return false;
        await logEvent(tx, e.id, POOL_EVENT.REOPENED, { note: `a request to deal with again${marked}: back in the pool for a new week` });
        return true;
      }, TX);
      if (moved) out.reopened.push(e.customerName);
    }
  }
  return out;
}

/**
 * reconsiderTriage for the console's routes, after an administrator marks, deletes, restores or erases requests.
 * Never the reason their change fails: the change is saved, and the sweep applies anything this could not.
 */
export async function applyConsoleTriage(keys: string[], by: string | null): Promise<void> {
  try {
    await reconsiderTriage(keys, { by });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    console.error("pool triage after a console change failed:", error instanceof Error ? error.name : "unknown", code ?? "");
  }
}

/**
 * The customers whose place disagrees with the console's triage: in the pool or held with nothing left to handle,
 * or set aside with something to handle. The sweep's net under the console's routes, which apply it at once.
 */
async function triageCandidates(): Promise<string[]> {
  const settled = [...SETTLED_TRIAGE];
  const working = [POOL_STATE.OPEN, POOL_STATE.HELD];
  const rows = await prisma.$queryRaw<{ k: string }[]>`
    SELECT e."customerKey" AS k FROM "LeadQueueEntry" e
     WHERE (e.state = ANY(${working}) AND NOT EXISTS (
              SELECT 1 FROM "Inquiry" i WHERE i."customerKey" = e."customerKey" AND i.status <> ALL(${settled})
              UNION ALL SELECT 1 FROM "ContactMessage" c WHERE c."customerKey" = e."customerKey" AND c.status <> ALL(${settled})
              UNION ALL SELECT 1 FROM "ShipmentInquiry" s WHERE s."customerKey" = e."customerKey" AND s.status <> ALL(${settled})))
        OR (e.state = ${POOL_STATE.DONE} AND EXISTS (
              SELECT 1 FROM "Inquiry" i WHERE i."customerKey" = e."customerKey" AND i.status <> ALL(${settled})
              UNION ALL SELECT 1 FROM "ContactMessage" c WHERE c."customerKey" = e."customerKey" AND c.status <> ALL(${settled})
              UNION ALL SELECT 1 FROM "ShipmentInquiry" s WHERE s."customerKey" = e."customerKey" AND s.status <> ALL(${settled})))
     LIMIT 2000`;
  return rows.map((r) => r.k);
}

// ---- the sweep ------------------------------------------------------------------------------------------------------------

export interface PoolSweepReport {
  at: string;
  officeOpen: boolean;
  dryRun: boolean;
  /**
   * Customers already on file taken in (the first sweep after the switch, then anyone an arrival missed): into the
   * pool, held, decided, or set aside as already handled (`done`: every request Handled, Spam or deleted).
   */
  takenIn: { open: number; held: number; heldOnClock: number; resolved: number; done: number; joinedHolder: number };
  /** Set aside since the last sweep: nothing left to handle, though the console's own route did not say so at once. */
  setAside: string[];
  /** Back in the pool: set aside before, with something to handle again. */
  reopened: string[];
  autoReleased: string[];
  stale: string[];
  invalidated: string[];
  keysFilled: number;
  codesIssued: number;
}

/**
 * What the cron does, every quarter of an hour (/api/cron/leads/rotate). Every step is safe to run twice: each
 * move is a conditional update that finds nothing to do the second time.
 *
 *   1. Nets under the forms: a customer key and an AFFHAN number for every lead.
 *   2. Anyone with live requests and no place in the pool is taken in (the switch to self-claim, then anybody an
 *      arrival missed): every request marked Handled, Spam or deleted, so set aside as Done; nobody holds them, so
 *      the pool, for a week from now; or held by one person, whose two-hour clock starts now unless they have
 *      recorded something since getting them; or decided, and left alone.
 *   3. The console's triage, for anything its routes did not apply at once: in the pool or held with nothing left to
 *      handle, set aside; set aside with something to handle again, back into the pool. Before the clocks, so a
 *      customer already handled is never auto-released or given up on.
 *   4. In office hours: taken and silent for two office hours, or In progress and quiet for two office days, back to
 *      the pool.
 *   5. Any hour: a week in the pool and still unhandled (waiting, or taken and never touched) is Invalid, and the
 *      administrators get one email listing them.
 */
export async function runPoolSweep(opts: { now?: Date; dryRun?: boolean } = {}): Promise<PoolSweepReport> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? false;
  const report: PoolSweepReport = {
    at: now.toISOString(),
    officeOpen: isOfficeOpen(now),
    dryRun,
    takenIn: { open: 0, held: 0, heldOnClock: 0, resolved: 0, done: 0, joinedHolder: 0 },
    setAside: [],
    reopened: [],
    autoReleased: [],
    stale: [],
    invalidated: [],
    keysFilled: 0,
    codesIssued: 0,
  };

  if (!dryRun) report.keysFilled = await fillMissingKeys();
  if (!dryRun) report.codesIssued = (await issueMissingCodes()).length;

  await takeIn(now, dryRun, report);

  const triage = await reconsiderTriage(await triageCandidates(), { now, dryRun });
  report.setAside = triage.setAside;
  report.reopened = triage.reopened;

  if (report.officeOpen) {
    // Taken, and nothing recorded since.
    const due = await prisma.leadQueueEntry.findMany({
      where: { state: POOL_STATE.HELD, nextRotationAt: { lte: now } },
      select: { id: true, customerKey: true, customerName: true, currentEmployeeId: true },
      take: 200,
    });
    for (const e of due) {
      if (dryRun || (await autoRelease(e, AUTO_RELEASE_REASON.SILENT, { nextRotationAt: { lte: now } }, now))) report.autoReleased.push(e.customerName);
    }

    // In progress, and quiet since.
    const worked = await prisma.leadQueueEntry.findMany({
      where: { state: POOL_STATE.HELD, nextRotationAt: null },
      select: { id: true, customerKey: true, customerName: true, currentEmployeeId: true },
      take: 1000,
    });
    const latest = await latestUpdates(worked.map((e) => e.customerKey));
    for (const e of worked) {
      const last = latest.get(e.customerKey);
      if (!last || normalizeStatus(last.status) !== "IN_PROGRESS" || staleDeadline(last.createdAt) > now) continue;
      if (dryRun || (await autoRelease(e, AUTO_RELEASE_REASON.STALE, { nextRotationAt: null }, now))) report.stale.push(e.customerName);
    }
  }

  // A week from first arriving in the pool, and still unhandled: waiting, or taken and never touched.
  const expired = await prisma.leadQueueEntry.findMany({
    where: { expiresAt: { lte: now }, OR: [{ state: POOL_STATE.OPEN }, { state: POOL_STATE.HELD, nextRotationAt: { not: null } }] },
    select: { id: true, customerKey: true, customerName: true, state: true, currentEmployeeId: true, enteredAt: true },
    take: 1000,
  });
  const given: { code: string | null; name: string; items: string; since: string; key: string }[] = [];
  for (const e of expired) {
    if (dryRun) {
      report.invalidated.push(e.customerName);
      continue;
    }
    const holder = await personOf(prisma, e.currentEmployeeId);
    const done = await prisma.$transaction(async (tx) => {
      const moved = await tx.leadQueueEntry.updateMany({
        where: { id: e.id, state: e.state, expiresAt: { lte: now } },
        data: { state: POOL_STATE.INVALID, currentEmployeeId: null, lastEmployeeId: e.currentEmployeeId, nextRotationAt: null, closedAt: now, closedReason: "INVALID" },
      });
      if (moved.count !== 1) return false;
      await assignAll(tx, e.customerKey, null, now);
      await logEvent(tx, e.id, POOL_EVENT.INVALIDATED, { from: holder, note: "a week in the pool, unhandled" });
      return true;
    }, TX);
    if (done) {
      report.invalidated.push(e.customerName);
      given.push({ code: null, name: e.customerName, items: "", since: formatDateTime(e.enteredAt), key: e.customerKey });
    }
  }
  if (given.length) await announceGivenUp(given);

  return report;
}

/** Back to the pool from the sweep, if the customer is still as it was read; true when this run moved them. */
async function autoRelease(
  e: { id: string; customerKey: string; currentEmployeeId: string | null },
  reason: string,
  still: Prisma.LeadQueueEntryWhereInput,
  now: Date,
): Promise<boolean> {
  const holder = await personOf(prisma, e.currentEmployeeId);
  return prisma.$transaction(async (tx) => {
    const moved = await tx.leadQueueEntry.updateMany({
      where: { id: e.id, state: POOL_STATE.HELD, currentEmployeeId: e.currentEmployeeId, ...still },
      data: { state: POOL_STATE.OPEN, currentEmployeeId: null, lastEmployeeId: e.currentEmployeeId, nextRotationAt: null },
    });
    if (moved.count !== 1) return false;
    await assignAll(tx, e.customerKey, null, now);
    await logEvent(tx, e.id, POOL_EVENT.AUTO_RELEASED, { from: holder, note: reason });
    return true;
  }, TX);
}

/** The newest status update on each customer's live leads. */
async function latestUpdates(keys: string[]): Promise<Map<string, { status: string; createdAt: Date; employeeId: string }>> {
  const out = new Map<string, { status: string; createdAt: Date; employeeId: string }>();
  if (keys.length === 0) return out;
  const rows = await prisma.$queryRaw<{ k: string; status: string; createdAt: Date; employeeId: string }[]>`
    SELECT DISTINCT ON (k) k, status, "createdAt", "employeeId" FROM (
      SELECT i."customerKey" AS k, u.status, u."createdAt", u."employeeId" FROM "StatusUpdate" u JOIN "Inquiry" i ON i.id = u."inquiryId"
       WHERE i."customerKey" = ANY(${keys}) AND i.status <> 'deleted'
      UNION ALL
      SELECT m."customerKey", u.status, u."createdAt", u."employeeId" FROM "StatusUpdate" u JOIN "ContactMessage" m ON m.id = u."contactId"
       WHERE m."customerKey" = ANY(${keys}) AND m.status <> 'deleted'
      UNION ALL
      SELECT s."customerKey", u.status, u."createdAt", u."employeeId" FROM "StatusUpdate" u JOIN "ShipmentInquiry" s ON s.id = u."shipmentId"
       WHERE s."customerKey" = ANY(${keys}) AND s.status <> 'deleted'
    ) x ORDER BY k, "createdAt" DESC`;
  for (const r of rows) out.set(r.k, { status: r.status, createdAt: r.createdAt, employeeId: r.employeeId });
  return out;
}

/**
 * Take in every customer with live requests and no place in the pool (or a place from the rotation that no longer
 * exists). On the first sweep after the switch that is everyone, so it is done in bulk: three reads of the leads,
 * one of their updates, and the entries written together.
 */
async function takeIn(now: Date, dryRun: boolean, report: PoolSweepReport) {
  const keys = (
    await prisma.$queryRaw<{ k: string }[]>`
      SELECT DISTINCT l.k FROM (
        SELECT "customerKey" AS k FROM "Inquiry" WHERE status <> 'deleted' AND "customerKey" IS NOT NULL
        UNION SELECT "customerKey" FROM "ContactMessage" WHERE status <> 'deleted' AND "customerKey" IS NOT NULL
        UNION SELECT "customerKey" FROM "ShipmentInquiry" WHERE status <> 'deleted' AND "customerKey" IS NOT NULL
      ) l
      WHERE NOT EXISTS (SELECT 1 FROM "LeadQueueEntry" e WHERE e."customerKey" = l.k AND e.state = ANY(${NEW_STATES}))
      LIMIT 2000`
  ).map((r) => r.k);
  if (keys.length === 0) return;

  const where = { customerKey: { in: keys }, ...LIVE };
  const leadSelect = { id: true, customerKey: true, assignedToId: true, assignedAt: true, createdAt: true, status: true } as const;
  const [inquiries, contacts, shipments, legacy, active] = await Promise.all([
    prisma.inquiry.findMany({ where, select: { ...leadSelect, customerName: true } }),
    prisma.contactMessage.findMany({ where, select: { ...leadSelect, fullName: true } }),
    prisma.shipmentInquiry.findMany({ where, select: { ...leadSelect, customerName: true } }),
    prisma.leadQueueEntry.findMany({ where: { customerKey: { in: keys } }, select: { id: true, customerKey: true } }),
    prisma.employee.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  type Row = { id: string; kind: LeadKind; key: string; holder: string | null; assignedAt: Date | null; createdAt: Date; name: string; status: string };
  const rows: Row[] = [
    ...inquiries.map((r) => ({ id: r.id, kind: "inquiry" as const, key: r.customerKey!, holder: r.assignedToId, assignedAt: r.assignedAt, createdAt: r.createdAt, name: r.customerName, status: r.status })),
    ...contacts.map((r) => ({ id: r.id, kind: "contact" as const, key: r.customerKey!, holder: r.assignedToId, assignedAt: r.assignedAt, createdAt: r.createdAt, name: r.fullName, status: r.status })),
    ...shipments.map((r) => ({ id: r.id, kind: "shipment" as const, key: r.customerKey!, holder: r.assignedToId, assignedAt: r.assignedAt, createdAt: r.createdAt, name: r.customerName, status: r.status })),
  ];
  const updates = await prisma.statusUpdate.findMany({
    where: {
      OR: [
        { inquiryId: { in: inquiries.map((r) => r.id) } },
        { contactId: { in: contacts.map((r) => r.id) } },
        { shipmentId: { in: shipments.map((r) => r.id) } },
      ],
    },
    select: { inquiryId: true, contactId: true, shipmentId: true, employeeId: true, status: true, createdAt: true },
  });
  const keyOfLead = new Map(rows.map((r) => [r.id, r.key]));
  const byKey = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byKey.get(r.key);
    if (list) list.push(r);
    else byKey.set(r.key, [r]);
  }
  const updatesBy = new Map<string, typeof updates>();
  for (const u of updates) {
    const key = keyOfLead.get(u.inquiryId ?? u.contactId ?? u.shipmentId ?? "");
    if (!key) continue;
    const list = updatesBy.get(key);
    if (list) list.push(u);
    else updatesBy.set(key, [u]);
  }
  const legacyBy = new Map(legacy.map((e) => [e.customerKey, e.id]));
  const people = new Map(active.map((p) => [p.id, p]));

  for (const [key, leads] of byKey) {
    leads.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const name = leads.find((l) => l.name)?.name || "Customer";
    const ups = (updatesBy.get(key) ?? []).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const latest = ups[0] ?? null;
    const assigned = leads.filter((l) => l.holder);
    // The holder of their newest assigned request, when there is one and they can still sign in.
    const holderId = assigned[0]?.holder ?? null;
    const holder = holderId ? people.get(holderId) ?? null : null;

    let data: { state: string; currentEmployeeId: string | null; nextRotationAt: Date | null; closedAt: Date | null; closedReason: string | null };
    let note: string;
    let joined = 0;
    const place = placeOnFile({
      decided: Boolean(latest && isFinalOutcome(latest.status)),
      needsHandling: leads.some((l) => needsHandling(l.status)),
      held: Boolean(holder),
    });
    if (place === POOL_STATE.RESOLVED) {
      data = { state: POOL_STATE.RESOLVED, currentEmployeeId: holder?.id ?? null, nextRotationAt: null, closedAt: latest!.createdAt, closedReason: "RESOLVED" };
      note = "decided before the switch to self-claim";
      report.takenIn.resolved += 1;
    } else if (place === POOL_STATE.DONE) {
      // Every request already Handled, Spam or deleted in the console: never in the pool, nobody's, no clock.
      data = { state: POOL_STATE.DONE, currentEmployeeId: null, nextRotationAt: null, closedAt: now, closedReason: "HANDLED" };
      note = holderId ? "already handled in the console: kept out of the pool, and let go by the person holding them" : "already handled in the console: kept out of the pool";
      report.takenIn.done += 1;
    } else if (place === POOL_STATE.OPEN) {
      data = { state: POOL_STATE.OPEN, currentEmployeeId: null, nextRotationAt: null, closedAt: null, closedReason: null };
      note = holderId ? "into the pool: the person holding them is deactivated" : "into the pool";
      report.takenIn.open += 1;
    } else {
      // Held: placeOnFile says so only when somebody who can still sign in has them.
      const keeper = holder!;
      // "Has an update" means one recorded by them since they were given this customer, not any older one.
      const since = new Date(Math.min(...assigned.filter((l) => l.holder === keeper.id).map((l) => (l.assignedAt ?? l.createdAt).getTime())));
      const touched = ups.some((u) => u.employeeId === keeper.id && u.createdAt >= since);
      joined = leads.filter((l) => l.holder !== keeper.id).length;
      data = { state: POOL_STATE.HELD, currentEmployeeId: keeper.id, nextRotationAt: touched ? null : releaseDeadline(now), closedAt: null, closedReason: null };
      note = touched ? `held by ${keeper.name}, being worked` : `held by ${keeper.name}: two office hours from now to record something`;
      report.takenIn.held += 1;
      if (!touched) report.takenIn.heldOnClock += 1;
      if (joined) report.takenIn.joinedHolder += 1;
    }
    if (dryRun) continue;

    await prisma.$transaction(async (tx) => {
      // Released with nobody holding them (in the pool, or set aside as already handled), or joined to the one
      // person who does.
      if ((data.state === POOL_STATE.OPEN || data.state === POOL_STATE.DONE) && assigned.length) await assignAll(tx, key, null, now);
      if (data.state === POOL_STATE.HELD && joined) await assignAll(tx, key, data.currentEmployeeId, now);
      const legacyId = legacyBy.get(key);
      const id = legacyId ?? randomUUID();
      if (legacyId) {
        await tx.leadQueueEntry.update({ where: { id }, data: { ...data, customerName: name, enteredAt: now, expiresAt: weekEnds(now), passes: 0 } });
      } else {
        await tx.leadQueueEntry.create({ data: { id, customerKey: key, customerName: name, ...data, enteredAt: now, expiresAt: weekEnds(now) } });
      }
      // Set aside from somebody who held them: the trail names who let go.
      const from = data.state === POOL_STATE.DONE && holderId ? (people.get(holderId) ?? null) : null;
      await logEvent(tx, id, POOL_EVENT.SWITCHED, { to: data.state === POOL_STATE.HELD ? holder : null, from, note });
    }, TX).catch((error) => {
      // An arrival opened this customer's place in the moment between reading and writing: theirs stands.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
      throw error;
    });
  }
}

/**
 * Tell the office who the pool gave up on: one email for the whole sweep, to every administrator. Failures are
 * logged and swallowed; an email that does not send must not undo a customer's state.
 */
async function announceGivenUp(customers: { name: string; items: string; since: string; key: string; code: string | null }[]) {
  try {
    const admins = await prisma.adminUser.findMany({ select: { email: true } });
    if (admins.length === 0) return;
    const codes = await customerCodesFor(customers.map((c) => c.key));
    const live = { ...LIVE };
    const described = await Promise.all(
      customers.map(async (c) => {
        const where = { customerKey: c.key, ...live };
        const [i, m, s] = await Promise.all([prisma.inquiry.count({ where }), prisma.contactMessage.count({ where }), prisma.shipmentInquiry.count({ where })]);
        const parts = [i ? `${i} ${i === 1 ? "product" : "products"}` : "", m ? `${m} ${m === 1 ? "message" : "messages"}` : "", s ? `${s} freight ${s === 1 ? "request" : "requests"}` : ""].filter(Boolean);
        return { code: codes[c.key] ?? null, name: c.name, items: parts.join(", ") || "nothing still on file", since: c.since };
      }),
    );
    const body = poolGivenUpEmail(described);
    for (const admin of admins) {
      const sent = await sendEmail({ ...body, to: admin.email });
      if (!sent.ok) console.warn(`[pool] could not tell an administrator about ${customers.length} given-up customer(s): ${sent.reason ?? "unknown"}`);
    }
  } catch (error) {
    console.error("pool notification failed:", error instanceof Error ? error.name : "unknown");
  }
}

/** Fill Inquiry/ContactMessage/ShipmentInquiry.customerKey wherever it is missing. */
async function fillMissingKeys(limit = 500): Promise<number> {
  let filled = 0;
  const [inquiries, contacts, shipments] = await Promise.all([
    prisma.inquiry.findMany({ where: { customerKey: null }, select: { id: true, phone: true, email: true }, take: limit }),
    prisma.contactMessage.findMany({ where: { customerKey: null }, select: { id: true, phone: true, email: true }, take: limit }),
    prisma.shipmentInquiry.findMany({ where: { customerKey: null }, select: { id: true, phone: true, email: true }, take: limit }),
  ]);
  for (const row of inquiries) {
    const key = customerKeyOf(row);
    if (key) { await prisma.inquiry.update({ where: { id: row.id }, data: { customerKey: key } }); filled += 1; }
  }
  for (const row of contacts) {
    const key = customerKeyOf(row);
    if (key) { await prisma.contactMessage.update({ where: { id: row.id }, data: { customerKey: key } }); filled += 1; }
  }
  for (const row of shipments) {
    const key = customerKeyOf(row);
    if (key) { await prisma.shipmentInquiry.update({ where: { id: row.id }, data: { customerKey: key } }); filled += 1; }
  }
  return filled;
}

// ---- the history ----------------------------------------------------------------------------------------------------------

/**
 * The moves the office reads in Activity and on a person's page: who took, let go, lost or was given whom, and who
 * closed a customer's requests by recording Lead or No lead.
 */
export const HISTORY_KINDS: string[] = [
  POOL_EVENT.TAKEN, POOL_EVENT.RELEASED, POOL_EVENT.NOT_ATTENDED, POOL_EVENT.AUTO_RELEASED, POOL_EVENT.ADMIN_ASSIGNED,
  POOL_EVENT.ADMIN_UNASSIGNED, POOL_EVENT.REOPENED, POOL_EVENT.INVALIDATED, POOL_EVENT.DONE, POOL_EVENT.REQUESTS_CLOSED,
];

export interface PoolEventRow {
  id: string;
  kind: string;
  at: string;
  from: { id: string | null; name: string | null };
  to: { id: string | null; name: string | null };
  note: string | null;
  customerName: string;
  code: string | null;
}

export async function poolEvents(opts: { employeeId?: string; page?: number; perPage?: number } = {}): Promise<{ total: number; rows: PoolEventRow[] }> {
  const perPage = opts.perPage ?? 50;
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.LeadQueueEventWhereInput = {
    kind: { in: HISTORY_KINDS },
    ...(opts.employeeId ? { OR: [{ fromEmployeeId: opts.employeeId }, { toEmployeeId: opts.employeeId }] } : {}),
  };
  const [total, events] = await Promise.all([
    prisma.leadQueueEvent.count({ where }),
    prisma.leadQueueEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, kind: true, createdAt: true, fromEmployeeId: true, fromName: true, toEmployeeId: true, toName: true, note: true,
        entry: { select: { customerName: true, customerKey: true } },
      },
    }),
  ]);
  const codes = await customerCodesFor(events.map((e) => e.entry.customerKey));
  return {
    total,
    rows: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      at: e.createdAt.toISOString(),
      from: { id: e.fromEmployeeId, name: e.fromName },
      to: { id: e.toEmployeeId, name: e.toName },
      note: e.note,
      customerName: e.entry.customerName,
      code: codes[e.entry.customerKey] ?? null,
    })),
  };
}

/** The moves that start somebody's hold on a customer: a Take, and the switch to self-claim finding them held. */
const HOLD_STARTS: string[] = [POOL_EVENT.TAKEN, POOL_EVENT.SWITCHED, POOL_EVENT.ADMIN_ASSIGNED, POOL_EVENT.JOINED];
/** And the ones that end it. */
const HOLD_ENDS: string[] = [
  POOL_EVENT.RELEASED, POOL_EVENT.NOT_ATTENDED, POOL_EVENT.AUTO_RELEASED, POOL_EVENT.ADMIN_UNASSIGNED, POOL_EVENT.INVALIDATED,
  POOL_EVENT.DONE,
];

// ---- where a customer stands, for the console's rows ------------------------------------------------------------------

/**
 * Where a customer stands in the pool, as the console's rows say it (every request and message of theirs shares it):
 *
 *   open      in the pool since it arrived or was let go
 *   held      taken by somebody, when, and what they have recorded since
 *   done      Lead or No lead, by whom, and when they took the customer
 *   handled   set aside: every request marked Handled, Spam or deleted in the console (the filters count it as done)
 *   invalid   given up on, and why
 *
 * The times are the real ones; the console works out "waiting 35m" and "held 2h" against its own clock.
 */
export type Handling =
  | { state: "open"; since: string }
  | { state: "held"; by: { id: string; name: string }; takenAt: string; status: string | null }
  | { state: "done"; outcome: string; by: { id: string | null; name: string | null }; takenAt: string | null; doneAt: string }
  | { state: "handled"; at: string }
  | { state: "invalid"; reason: string; at: string };

export async function handlingFor(keys: (string | null | undefined)[]): Promise<Record<string, Handling>> {
  const unique = [...new Set(keys.filter((k): k is string => Boolean(k)))];
  if (unique.length === 0) return {};
  const entries = await prisma.leadQueueEntry.findMany({
    where: { customerKey: { in: unique } },
    select: {
      customerKey: true, state: true, enteredAt: true, closedAt: true,
      currentEmployee: { select: { id: true, name: true } },
      events: { orderBy: { createdAt: "asc" }, select: { kind: true, createdAt: true, fromEmployeeId: true, fromName: true, toEmployeeId: true, note: true } },
    },
  });
  const latest = await latestUpdates(entries.filter((e) => e.state === POOL_STATE.HELD || e.state === POOL_STATE.RESOLVED).map((e) => e.customerKey));
  const out: Record<string, Handling> = {};
  for (const e of entries) {
    const events = [...e.events].reverse();
    if (e.state === POOL_STATE.OPEN) {
      const since = events.find((x) => x.kind === POOL_EVENT.OPENED || x.kind === POOL_EVENT.REOPENED || x.kind === POOL_EVENT.SWITCHED || HOLD_ENDS.includes(x.kind));
      out[e.customerKey] = { state: "open", since: (since?.createdAt ?? e.enteredAt).toISOString() };
    } else if (e.state === POOL_STATE.HELD && e.currentEmployee) {
      const holder = e.currentEmployee;
      const started = events.find((x) => HOLD_STARTS.includes(x.kind) && x.toEmployeeId === holder.id);
      const takenAt = started?.createdAt ?? e.enteredAt;
      const last = latest.get(e.customerKey);
      out[e.customerKey] = {
        state: "held",
        by: holder,
        takenAt: takenAt.toISOString(),
        status: last && last.createdAt >= takenAt ? normalizeStatus(last.status) : null,
      };
    } else if (e.state === POOL_STATE.RESOLVED) {
      const resolved = events.find((x) => x.kind === POOL_EVENT.RESOLVED);
      const doneAt = resolved?.createdAt ?? e.closedAt ?? e.enteredAt;
      const byId = resolved?.fromEmployeeId ?? e.currentEmployee?.id ?? null;
      const started = events.find((x) => HOLD_STARTS.includes(x.kind) && x.toEmployeeId === byId && x.createdAt <= doneAt);
      const outcome = normalizeStatus(latest.get(e.customerKey)?.status) || (resolved?.note === "became business" ? "LEAD" : "NO_LEAD");
      out[e.customerKey] = {
        state: "done",
        outcome,
        by: { id: byId, name: resolved?.fromName ?? e.currentEmployee?.name ?? null },
        takenAt: started ? started.createdAt.toISOString() : null,
        doneAt: doneAt.toISOString(),
      };
    } else if (e.state === POOL_STATE.DONE) {
      const setAside = events.find((x) => x.kind === POOL_EVENT.DONE || x.kind === POOL_EVENT.SWITCHED);
      out[e.customerKey] = { state: "handled", at: (e.closedAt ?? setAside?.createdAt ?? e.enteredAt).toISOString() };
    } else if (e.state === POOL_STATE.INVALID) {
      const invalidated = events.find((x) => x.kind === POOL_EVENT.INVALIDATED);
      out[e.customerKey] = {
        state: "invalid",
        reason: invalidated?.note ?? "unhandled",
        at: (e.closedAt ?? invalidated?.createdAt ?? e.enteredAt).toISOString(),
      };
    }
  }
  return out;
}

// ---- one customer's handling, step by step (the console's inquiry popup) -----------------------------------------------

export interface HandlingStep {
  at: string;
  /** The trail's kind, or STATUS for an outcome somebody recorded, or ARRIVED for a request coming in. */
  kind: string;
  label: string;
  who: string | null;
  note: string | null;
}

/**
 * Everything that happened to the customer behind one request, oldest first: it arrived, who took it and when, what
 * they recorded, who let it go and why, who took it next, how it ended. From the trail (LeadQueueEvent) and the
 * outcomes staff recorded (StatusUpdate); nothing is stored for it.
 */
export async function handlingHistory(lead: LeadRef): Promise<{ code: string | null; steps: HandlingStep[] } | null> {
  const select = { createdAt: true, customerKey: true, phone: true, email: true } as const;
  const row =
    lead.kind === "inquiry"
      ? await prisma.inquiry.findUnique({ where: { id: lead.id }, select: { ...select, productName: true } })
      : lead.kind === "contact"
        ? await prisma.contactMessage.findUnique({ where: { id: lead.id }, select })
        : await prisma.shipmentInquiry.findUnique({ where: { id: lead.id }, select: { ...select, referenceNo: true } });
  if (!row) return null;
  const what = "productName" in row ? row.productName : "referenceNo" in row ? `Freight request ${row.referenceNo}` : "Contact message";
  const steps: HandlingStep[] = [{ at: row.createdAt.toISOString(), kind: "ARRIVED", label: "Arrived", who: null, note: what }];
  const key = row.customerKey ?? customerKeyOf(row);
  if (!key) return { code: null, steps };

  const [entry, updates, codes] = await Promise.all([
    prisma.leadQueueEntry.findUnique({
      where: { customerKey: key },
      select: { events: { orderBy: { createdAt: "asc" }, select: { kind: true, createdAt: true, fromName: true, toName: true, note: true } } },
    }),
    prisma.$queryRaw<{ status: string; note: string | null; createdAt: Date; name: string }[]>`
      SELECT DISTINCT ON (u."createdAt", u."employeeId", u.status) u.status, u.note, u."createdAt", e.name FROM (
        SELECT su.* FROM "StatusUpdate" su JOIN "Inquiry" i ON i.id = su."inquiryId" WHERE i."customerKey" = ${key}
        UNION ALL SELECT su.* FROM "StatusUpdate" su JOIN "ContactMessage" m ON m.id = su."contactId" WHERE m."customerKey" = ${key}
        UNION ALL SELECT su.* FROM "StatusUpdate" su JOIN "ShipmentInquiry" s ON s.id = su."shipmentId" WHERE s."customerKey" = ${key}
      ) u JOIN "Employee" e ON e.id = u."employeeId"
      ORDER BY u."createdAt", u."employeeId", u.status`,
    customerCodesFor([key]),
  ]);

  for (const e of entry?.events ?? []) {
    // The release clock stopping says nothing an outcome step does not; an arrival is already the first step.
    if (e.kind === POOL_EVENT.HELD || e.kind === POOL_EVENT.OPENED) continue;
    const who =
      e.kind === POOL_EVENT.TAKEN || e.kind === POOL_EVENT.SWITCHED || e.kind === POOL_EVENT.ADMIN_ASSIGNED || e.kind === POOL_EVENT.JOINED
        ? e.toName ?? e.fromName
        : e.fromName;
    steps.push({ at: e.createdAt.toISOString(), kind: e.kind, label: e.kind === POOL_EVENT.RESOLVED ? "Completed" : poolKindLabel(e.kind), who, note: e.note });
  }
  for (const u of updates) {
    steps.push({ at: u.createdAt.toISOString(), kind: "STATUS", label: normalizeStatus(u.status), who: u.name, note: u.note });
  }
  steps.sort((a, b) => a.at.localeCompare(b.at));
  return { code: codes[key] ?? null, steps };
}

// ---- Team Performance ---------------------------------------------------------------------------------------------------

export interface PerfWindow {
  taken: number;
  /** Lead or No lead recorded. */
  completed: number;
  /** Release or Not attended. */
  released: number;
  /** The pool's: nothing recorded in time, or In progress gone quiet. */
  autoReleased: number;
  /** Office minutes from a Take to the taker's first update, averaged over the Takes that got one. */
  toFirstUpdate: number | null;
  /** Office minutes from a Take to Lead or No lead, averaged over the Takes that got there. */
  toCompletion: number | null;
}

export type PoolPerformance = { d7: PerfWindow; d30: PerfWindow };

const emptyWindow = (): PerfWindow => ({ taken: 0, completed: 0, released: 0, autoReleased: 0, toFirstUpdate: null, toCompletion: null });

/**
 * Per person, the last 7 and 30 days in the pool: how many customers they took, completed, released and lost to the
 * pool's clocks, and how long, on average, from taking a customer to their first update and to Lead or No lead.
 * The averages count office hours only (lib/office-hours.ts: Monday to Saturday, 09:30–18:30), so nights and Sundays
 * are not held against anybody. The counts go by when each thing happened; the averages by when the customer was
 * taken, following each hold until it ended.
 */
export async function poolPerformance(now = new Date()): Promise<Map<string, PoolPerformance>> {
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const d7 = new Date(now.getTime() - 7 * 86_400_000);
  const events = await prisma.leadQueueEvent.findMany({
    where: { createdAt: { gte: d30 } },
    orderBy: { createdAt: "asc" },
    select: { entryId: true, kind: true, fromEmployeeId: true, toEmployeeId: true, createdAt: true, entry: { select: { customerKey: true } } },
  });
  const takes = events.filter((e) => e.kind === POOL_EVENT.TAKEN && e.toEmployeeId);
  const keys = [...new Set(takes.map((t) => t.entry.customerKey))];
  const updates = keys.length
    ? await prisma.$queryRaw<{ k: string; employeeId: string; createdAt: Date }[]>`
        SELECT k, "employeeId", "createdAt" FROM (
          SELECT i."customerKey" AS k, u."employeeId", u."createdAt" FROM "StatusUpdate" u JOIN "Inquiry" i ON i.id = u."inquiryId"
           WHERE i."customerKey" = ANY(${keys}) AND u."createdAt" >= ${d30}
          UNION ALL
          SELECT m."customerKey", u."employeeId", u."createdAt" FROM "StatusUpdate" u JOIN "ContactMessage" m ON m.id = u."contactId"
           WHERE m."customerKey" = ANY(${keys}) AND u."createdAt" >= ${d30}
          UNION ALL
          SELECT s."customerKey", u."employeeId", u."createdAt" FROM "StatusUpdate" u JOIN "ShipmentInquiry" s ON s.id = u."shipmentId"
           WHERE s."customerKey" = ANY(${keys}) AND u."createdAt" >= ${d30}
        ) x ORDER BY "createdAt" ASC`
    : [];

  type Acc = { w: PerfWindow; first: number[]; done: number[] };
  const out = new Map<string, { d7: Acc; d30: Acc }>();
  const acc = (id: string) => {
    let row = out.get(id);
    if (!row) {
      row = { d7: { w: emptyWindow(), first: [], done: [] }, d30: { w: emptyWindow(), first: [], done: [] } };
      out.set(id, row);
    }
    return row;
  };
  const count = (id: string | null, field: "taken" | "completed" | "released" | "autoReleased", at: Date) => {
    if (!id) return;
    const row = acc(id);
    row.d30.w[field] += 1;
    if (at >= d7) row.d7.w[field] += 1;
  };
  for (const e of events) {
    if (e.kind === POOL_EVENT.TAKEN) count(e.toEmployeeId, "taken", e.createdAt);
    else if (e.kind === POOL_EVENT.RESOLVED) count(e.fromEmployeeId, "completed", e.createdAt);
    else if (e.kind === POOL_EVENT.RELEASED || e.kind === POOL_EVENT.NOT_ATTENDED) count(e.fromEmployeeId, "released", e.createdAt);
    else if (e.kind === POOL_EVENT.AUTO_RELEASED) count(e.fromEmployeeId, "autoReleased", e.createdAt);
  }

  for (const take of takes) {
    const who = take.toEmployeeId!;
    const at = take.createdAt;
    // The hold runs until the customer left them, or until now.
    const end = events.find((e) => e.entryId === take.entryId && e.createdAt > at && HOLD_ENDS.includes(e.kind))?.createdAt ?? now;
    const first = updates.find((u) => u.k === take.entry.customerKey && u.employeeId === who && u.createdAt >= at && u.createdAt <= end);
    const done = events.find((e) => e.entryId === take.entryId && e.kind === POOL_EVENT.RESOLVED && e.fromEmployeeId === who && e.createdAt >= at && e.createdAt <= end);
    const row = acc(who);
    for (const win of at >= d7 ? [row.d7, row.d30] : [row.d30]) {
      if (first) win.first.push(officeMinutesBetween(at, first.createdAt));
      if (done) win.done.push(officeMinutesBetween(at, done.createdAt));
    }
  }

  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const result = new Map<string, PoolPerformance>();
  for (const [id, row] of out) {
    result.set(id, {
      d7: { ...row.d7.w, toFirstUpdate: mean(row.d7.first), toCompletion: mean(row.d7.done) },
      d30: { ...row.d30.w, toFirstUpdate: mean(row.d30.first), toCompletion: mean(row.d30.done) },
    });
  }
  return result;
}

export const emptyPerformance = (): PoolPerformance => ({ d7: emptyWindow(), d30: emptyWindow() });
