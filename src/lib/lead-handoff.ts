import { prisma } from "@/lib/prisma";

/**
 * What happened to a customer straight after somebody passed on them.
 *
 * "KHAJA MOHIDEEN marked Yuvaraj. M as Not attended" is half a sentence. The
 * whole point of that button is that the customer leaves the person who
 * pressed it and goes to somebody else immediately, and the feed stopped
 * before the part an administrator actually wants: who has them now.
 *
 * Nothing new is recorded for this. The rotation has written it down since it
 * was built — LeadQueueEvent, one row per handover, with the name of the
 * person it went to copied onto it. It simply had no reader on this page.
 *
 * THE JOIN. A StatusUpdate points at an inquiry or a message; a queue entry is
 * keyed by customerKey, which those rows carry. So the bridge is the lead's
 * customerKey, and the event belonging to a particular decline is the first
 * decisive one at or after the moment it was recorded WHOSE `from` is the
 * person who recorded it.
 *
 * That second half is not belt and braces. The rotation's daily sweep also
 * writes INVALIDATED, days later and with no `from` at all; matching on time
 * alone would hang "nobody took it on" off a decline that had in fact handed
 * the customer straight to somebody. Matching the person as well means only
 * the event this act caused can attach to it.
 *
 * The clock runs the right way round by construction: the status rows are
 * written first and the queue is moved after them, in the same request. Live,
 * the gap measures about 140ms.
 */

/** The kinds that answer "and then what?" — the rest are bookkeeping. */
const DECISIVE = ["ENTERED", "ROTATED", "PARKED", "INVALIDATED"] as const;

export type Handoff =
  /** Straight to the next person in the rotation. */
  | { kind: "passed"; toName: string; toEmployeeId: string | null }
  /** Nobody to hand it to, so it is sitting unassigned until the team grows. */
  | { kind: "waiting"; reason: string | null }
  /** Offered to the whole team, twice, and taken on by nobody. */
  | { kind: "nobody" };

/** A queue event, as this file needs to read it. */
export interface QueueEventRow {
  kind: string;
  toName: string | null;
  toEmployeeId: string | null;
  fromEmployeeId: string | null;
  note: string | null;
  createdAt: Date;
}

/** One decline, as the feed knows it. */
export interface Decline {
  /** Whatever the caller keys its own rows by; handed back unchanged. */
  id: string;
  customerKey: string | null;
  /** Who recorded the Not attended. */
  employeeId: string;
  at: Date;
}

/**
 * The consequence of each decline, keyed by the caller's own id.
 *
 * A decline with no entry in the returned map has no queue event to show —
 * the lead had no customerKey, or the follow-up failed at the time (the status
 * route records the outcome first and moves the customer after, deliberately,
 * so that a queue that cannot be moved never costs a salesperson the outcome
 * they just wrote). Say nothing in that case rather than guess: an invented
 * "→ passed to" is worse than a line that stops where the record does.
 *
 * One query however many declines are on the page.
 */
export async function handoffsFor(declines: Decline[]): Promise<Map<string, Handoff>> {
  const out = new Map<string, Handoff>();
  const keys = [...new Set(declines.map((d) => d.customerKey).filter((k): k is string => Boolean(k)))];
  if (keys.length === 0) return out;

  const entries = await prisma.leadQueueEntry.findMany({
    where: { customerKey: { in: keys } },
    select: {
      customerKey: true,
      events: {
        where: { kind: { in: [...DECISIVE] } },
        orderBy: { createdAt: "asc" },
        select: { kind: true, toName: true, toEmployeeId: true, fromEmployeeId: true, note: true, createdAt: true },
      },
    },
  });
  const byKey = new Map(entries.map((e) => [e.customerKey, e.events]));

  for (const d of declines) {
    const events = d.customerKey ? byKey.get(d.customerKey) : undefined;
    const handoff = events ? handoffOf(events, d) : null;
    if (handoff) out.set(d.id, handoff);
  }
  return out;
}

/**
 * The matching itself, with no database in it — which is what makes the four
 * endings testable. Events must arrive oldest first.
 *
 * Returns null where the record does not answer the question, and that is a
 * real answer rather than a gap to paper over: a decline whose follow-up never
 * ran has no successor to name, and the feed should stop where the record
 * does.
 */
export function handoffOf(events: QueueEventRow[], decline: Pick<Decline, "employeeId" | "at">): Handoff | null {
  const event = events.find(
    (e) => DECISIVE.includes(e.kind as (typeof DECISIVE)[number])
      && e.createdAt >= decline.at
      && e.fromEmployeeId === decline.employeeId,
  );
  if (!event) return null;
  if (event.kind === "INVALIDATED") return { kind: "nobody" };
  if (event.kind === "PARKED") return { kind: "waiting", reason: event.note };
  return event.toName ? { kind: "passed", toName: event.toName, toEmployeeId: event.toEmployeeId } : null;
}
