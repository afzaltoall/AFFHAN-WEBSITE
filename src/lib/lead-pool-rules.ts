import { addOfficeMinutes, OFFICE_DAY_MINUTES, startOfNextOfficeDay } from "./office-hours";
import { POOL_WEEK_MS, RELEASE_AFTER_OFFICE_MINUTES, STALE_IN_PROGRESS_OFFICE_DAYS } from "./lead-pool-config";
import { normalizeStatus } from "./leadStatus";

/**
 * The open pool's rules, with no database in them: which state a customer is in, what the trail calls each thing
 * that happens, and the clocks. lib/lead-pool.ts applies them; tests/lead-pool reads them directly.
 */

/** Where a customer stands (LeadQueueEntry.state): in the pool, held by somebody, decided, done with, or given up on. */
export const POOL_STATE = {
  OPEN: "OPEN",
  HELD: "HELD",
  RESOLVED: "RESOLVED",
  /** Every request of theirs is marked Handled, Spam or deleted in the console: out of the pool, nobody's, no clock. */
  DONE: "DONE",
  INVALID: "INVALID",
} as const;

/** What the trail calls each thing that happens to a customer (LeadQueueEvent.kind). */
export const POOL_EVENT = {
  /** Arrived: a first quote request, message or freight request. */
  OPENED: "OPENED",
  /** A returning customer's new request, joining whoever holds them, or their place in the pool. */
  JOINED: "JOINED",
  TAKEN: "TAKEN",
  /** The holder pressed Release. */
  RELEASED: "RELEASED",
  /** The holder recorded Not attended, which puts the customer back in the pool. */
  NOT_ATTENDED: "NOT_ATTENDED",
  /** The sweep: nothing recorded in time after taking, or In progress gone quiet. */
  AUTO_RELEASED: "AUTO_RELEASED",
  /** The holder recorded something: the release clock stops. */
  HELD: "HELD",
  /** Lead or No lead. */
  RESOLVED: "RESOLVED",
  /** A week in the pool and still unhandled. */
  INVALIDATED: "INVALIDATED",
  /** No longer written (administrators hand nobody out); read on older trails. */
  ADMIN_ASSIGNED: "ADMIN_ASSIGNED",
  /** An administrator's Release to pool, or the holder's deactivation. */
  ADMIN_UNASSIGNED: "ADMIN_UNASSIGNED",
  /**
   * Back in the pool for a new week: a customer given up on, set aside as already handled, or decided by somebody since
   * deactivated, who sent a new request or has one to deal with again.
   */
  REOPENED: "REOPENED",
  /** The first sweep after self-claim shipped, taking in a customer already on file. */
  SWITCHED: "SWITCHED",
  /** Set aside: every request of theirs is now marked Handled, Spam or deleted in the console. */
  DONE: "DONE",
} as const;

/** Leaving somebody these ways keeps that person from taking the customer back until the next office day. */
export const LEAVE_KINDS: readonly string[] = [POOL_EVENT.RELEASED, POOL_EVENT.NOT_ATTENDED, POOL_EVENT.AUTO_RELEASED];

/** Why the sweep gave a customer back, as the trail and Team Performance read it. */
export const AUTO_RELEASE_REASON = {
  SILENT: "nothing recorded within two office hours of taking",
  STALE: "stale in progress",
} as const;

/**
 * What the console's old assign action answers now (410 Gone): administrators no longer hand customers to people.
 * Staff take them from the open pool; the one control left is Release to pool, on the Queue page.
 */
export const ASSIGN_GONE =
  "Assigning has gone: staff take customers from the open pool themselves. To free a held customer, use Release to pool on the Queue page.";

/** Lead, No lead and Invalid end a customer's open life; nothing else does. */
export function isFinalOutcome(status: string | null | undefined): boolean {
  const s = normalizeStatus(status);
  return s === "LEAD" || s === "NO_LEAD" || s === "INVALID";
}

/**
 * The console's triage marks (the `status` of an Inquiry, ContactMessage or ShipmentInquiry) that say a request
 * needs nothing more from the team.
 */
export const SETTLED_TRIAGE: readonly string[] = ["handled", "spam", "deleted"];

/** A request still to be dealt with: anything the console has not marked Handled, Spam or deleted. */
export function needsHandling(status: string | null | undefined): boolean {
  return !SETTLED_TRIAGE.includes((status ?? "").trim().toLowerCase());
}

/**
 * Where a customer already on file goes when the pool first meets them (the switch, or the sweep taking in anybody an
 * arrival missed). Decided stays decided; a customer with nothing left to handle, every request marked Handled, Spam
 * or deleted, is set aside as Done and never enters the pool (the owner, 2026-10-22); anybody else is held by the
 * person who has them, or goes into the pool.
 */
export function placeOnFile(c: { decided: boolean; needsHandling: boolean; held: boolean }): "RESOLVED" | "DONE" | "HELD" | "OPEN" {
  if (c.decided) return POOL_STATE.RESOLVED;
  if (!c.needsHandling) return POOL_STATE.DONE;
  return c.held ? POOL_STATE.HELD : POOL_STATE.OPEN;
}

/**
 * What a change in the console's triage does to a customer the pool already knows: in the pool or held, with
 * nothing left to handle, they are set aside as Done (never auto-released); set aside, with something to handle
 * again, they go back into the pool. Decided and given-up customers stay where they are.
 */
export function triageMove(state: string, needs: boolean): "set-aside" | "reopen" | null {
  if (!needs && (state === POOL_STATE.OPEN || state === POOL_STATE.HELD)) return "set-aside";
  if (needs && state === POOL_STATE.DONE) return "reopen";
  return null;
}

/** When a customer taken now goes back to the pool if nothing is recorded: two office hours. */
export function releaseDeadline(from: Date): Date {
  return addOfficeMinutes(from, RELEASE_AFTER_OFFICE_MINUTES);
}

/** When an In progress customer with no newer update goes back to the pool: two office days. */
export function staleDeadline(lastUpdate: Date): Date {
  return addOfficeMinutes(lastUpdate, STALE_IN_PROGRESS_OFFICE_DAYS * OFFICE_DAY_MINUTES);
}

/** From when someone a customer left (Release, auto-release, Not attended) may take them again. */
export function retakeAllowedFrom(leftAt: Date): Date {
  return startOfNextOfficeDay(leftAt);
}

/** When a customer's week in the pool runs out. */
export function weekEnds(from: Date): Date {
  return new Date(from.getTime() + POOL_WEEK_MS);
}

/** The trail's own words, as the office says them: the Queue page, Activity and a person's page. */
export function poolKindLabel(kind: string): string {
  switch (kind) {
    case POOL_EVENT.OPENED: return "Arrived in the pool";
    case POOL_EVENT.JOINED: return "New request joined";
    case POOL_EVENT.TAKEN: return "Taken";
    case POOL_EVENT.RELEASED: return "Released";
    case POOL_EVENT.NOT_ATTENDED: return "Not attended: back to the pool";
    case POOL_EVENT.AUTO_RELEASED: return "Back to the pool automatically";
    case POOL_EVENT.HELD: return "Being worked";
    case POOL_EVENT.RESOLVED: return "Decided";
    case POOL_EVENT.INVALIDATED: return "Given up on";
    case POOL_EVENT.ADMIN_ASSIGNED: return "Assigned by an administrator";
    case POOL_EVENT.ADMIN_UNASSIGNED: return "Put in the pool by an administrator";
    case POOL_EVENT.REOPENED: return "Back into the pool";
    case POOL_EVENT.SWITCHED: return "Taken in at the switch to self-claim";
    case POOL_EVENT.DONE: return "Already handled: out of the pool";
    // The rotation's kinds, on customers it handled before the pool.
    case "ENTERED": return "Entered the rotation";
    case "ROTATED": return "Handed on by the rotation";
    case "PARKED": return "Parked by the rotation";
    case "RESUMED": return "Back into the rotation";
    case "PASS_COMPLETE": return "The whole team had been asked";
    case "MANUAL_ASSIGN": return "Assigned by an administrator";
    case "CLOSED": return "Closed";
    default: return kind.replace(/_/g, " ").toLowerCase();
  }
}

/** "Priya" of "Priya Raman": what "Already taken by …" says. */
export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "somebody";
}
