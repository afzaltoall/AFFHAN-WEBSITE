import { formatDateTime, formatSince } from "./datetime";
import { leadStatusLabel } from "./leadStatus";
import type { Handling } from "./lead-pool";

/**
 * Where a lead's customer stands in the open pool, in words, for the console's rows (HandlingChip draws it):
 *
 *   Open · waiting 35m                                    in the pool since it arrived or was let go
 *   Taken by Priya · 10:42 AM · held 1h 20m · In progress  somebody has them
 *   Lead by Priya · took 2h 10m                           decided, and how long from taking them
 *   Done · already handled                                every request marked Handled, Spam or deleted
 *   Invalid · a week in the pool, unhandled               given up on
 *
 * Real clock times and durations: the office-hours averages are Team Performance's. Every request and message of
 * one customer reads the same, since the pool holds customers, not rows. No JSX and only relative imports, so the
 * tests can import it as it is.
 */

export type HandlingKey = "open" | "held" | "done" | "invalid";
export type HandlingFilter = "all" | HandlingKey;

export const HANDLING_FILTERS: { key: HandlingFilter; label: string; dot: string }[] = [
  { key: "all", label: "All", dot: "bg-slate-300" },
  { key: "open", label: "Open", dot: "bg-sky-500" },
  { key: "held", label: "Held", dot: "bg-amber-500" },
  { key: "done", label: "Done", dot: "bg-emerald-500" },
  { key: "invalid", label: "Invalid", dot: "bg-slate-600" },
];

/**
 * A lead with no place in the pool yet (before the first sweep after the switch) counts as open; one set aside as
 * already handled counts as done, with the decided ones.
 */
export const handlingKey = (h: Handling | null | undefined): HandlingKey =>
  !h ? "open" : h.state === "handled" ? "done" : h.state;

export const matchesHandling = (h: Handling | null | undefined, filter: HandlingFilter) => filter === "all" || handlingKey(h) === filter;

/**
 * For "sort by waiting time": how long the row has waited for what comes next, longest first. Open rows wait since
 * they arrived or were let go; held ones since they were taken; decided and given-up rows wait for nothing and go
 * last, newest first among themselves.
 */
export function waitingRank(h: Handling | null | undefined, createdAt: string): [number, number] {
  if (!h) return [0, new Date(createdAt).getTime()];
  if (h.state === "open") return [0, new Date(h.since).getTime()];
  if (h.state === "held") return [1, new Date(h.takenAt).getTime()];
  return [2, -new Date(h.state === "done" ? h.doneAt : h.at).getTime()];
}

/** "35m", "1h 20m", "3d 4h": how long, in words, from a duration in ms. */
export function span(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function handlingText(h: Handling | null | undefined, createdAt: string, now = Date.now()): { text: string; title: string } {
  const at = new Date(now);
  if (!h) return { text: `Open · waiting ${span(now - new Date(createdAt).getTime())}`, title: `Arrived ${formatDateTime(createdAt)}` };
  if (h.state === "open") return { text: `Open · waiting ${span(now - new Date(h.since).getTime())}`, title: `In the pool since ${formatDateTime(h.since)}` };
  if (h.state === "held") {
    const status = h.status ? ` · ${leadStatusLabel(h.status)}` : " · nothing recorded yet";
    return {
      text: `Taken by ${h.by.name} · ${formatSince(h.takenAt, at)} · held ${span(now - new Date(h.takenAt).getTime())}${status}`,
      title: `Taken ${formatDateTime(h.takenAt)}`,
    };
  }
  if (h.state === "done") {
    const took = h.takenAt ? ` · took ${span(new Date(h.doneAt).getTime() - new Date(h.takenAt).getTime())}` : "";
    return { text: `${leadStatusLabel(h.outcome)} by ${h.by.name ?? "somebody"}${took}`, title: `Decided ${formatDateTime(h.doneAt)}` };
  }
  if (h.state === "handled") {
    return { text: "Done · already handled", title: `Out of the pool since ${formatDateTime(h.at)}: every request is marked Handled, Spam or deleted` };
  }
  return { text: `Invalid · ${h.reason}`, title: `Given up on ${formatDateTime(h.at)}` };
}
