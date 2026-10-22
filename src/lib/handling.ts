import { formatDateTime, formatSince } from "./datetime";
import { leadStatusLabel } from "./leadStatus";
import { isOfficeOpen, nextOfficeOpening } from "./office-hours";
import type { Handling } from "./lead-pool";

/**
 * Where a lead's customer stands in the open pool, in words, for the console's rows (HandlingChip draws it):
 *
 *   Open · waiting 35m                                     in the pool since it arrived or was let go
 *   Taken by Priya · auto-release in 1h 10m                somebody has them, and when they go back by themselves
 *   Taken by Priya · In progress · auto-release in 1d 20h  the same, with what they recorded since taking them
 *   Lead by Priya · took 2h 10m                            decided, and how long from taking them
 *   Done · already handled                                 every request marked Handled, Spam or deleted
 *   Invalid · a week in the pool, unhandled                given up on
 *
 * The Queue page used to say who holds whom and the time left; the chip and the popup say it since it went (the
 * owner, 2026-10-22). The exact times are in the chip's title.
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

/**
 * What the console says when an administrator tries to mark a held customer Handled (the owner, 2026-10-22): the
 * person holding them closes them, by recording Lead or No lead. The server refuses with the same words.
 */
export function heldByMessage(holders: string[], customers = 1): string {
  // In alphabetical order, so the console and the server name several people the same way.
  const names = [...new Set(holders.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const who = names.length === 0 ? "somebody" : names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Held by ${who} — they will close ${customers === 1 ? "it" : "them"}`;
}

/** "Held by Priya Raman since 10:42 AM": the popup's line beside Release to pool. */
export const heldSince = (h: Extract<Handling, { state: "held" }>, now = Date.now()): string =>
  `Held by ${h.by.name} since ${formatSince(h.takenAt, new Date(now))}`;

/** The same words for one console row, when somebody holds its customer; null when nobody does. */
export const heldByOf = (h: Handling | null | undefined): string | null => (h?.state === "held" ? heldByMessage([h.by.name]) : null);

/**
 * For a selection in the console: the words refusing Handled when any of its customers is held, or null. Counts
 * customers, not rows, since one customer's requests all share the holder.
 */
export function heldRefusal(rows: { key: string; handling: Handling | null | undefined }[]): string | null {
  const holders = new Map<string, string>();
  for (const r of rows) if (r.handling?.state === "held") holders.set(r.key, r.handling.by.name);
  return holders.size ? heldByMessage([...holders.values()], holders.size) : null;
}

/** "35m", "1h 20m", "3d 4h": how long, in words, from a duration in ms. */
export function span(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * When a held customer goes back to the pool by themselves, as the Queue page said it: real time left, since the
 * deadline is already a moment inside office hours. Past it, the next sweep releases them, or the first one after the
 * office opens.
 */
function releaseWords(h: Extract<Handling, { state: "held" }>, now: number): { text: string; title: string } {
  if (!h.releaseAt) return { text: " · no auto-release", title: "" };
  const at = new Date(now);
  const left = new Date(h.releaseAt).getTime() - now;
  const title = ` · back to the pool ${formatDateTime(h.releaseAt)} ${h.clock === "stale" ? "unless something newer is recorded" : "if nothing is recorded"}`;
  if (left > 0) return { text: ` · auto-release in ${span(left)}`, title };
  return isOfficeOpen(at)
    ? { text: " · auto-release due", title }
    : { text: ` · auto-release when the office opens, ${formatSince(nextOfficeOpening(at), at)}`, title };
}

export function handlingText(h: Handling | null | undefined, createdAt: string, now = Date.now()): { text: string; title: string } {
  if (!h) return { text: `Open · waiting ${span(now - new Date(createdAt).getTime())}`, title: `Arrived ${formatDateTime(createdAt)}` };
  if (h.state === "open") {
    return {
      text: `Open · waiting ${span(now - new Date(h.since).getTime())}`,
      title: `In the pool since ${formatDateTime(h.since)} · given up on ${formatDateTime(h.until)} if nobody takes them`,
    };
  }
  if (h.state === "held") {
    const status = h.status ? ` · ${leadStatusLabel(h.status)}` : "";
    const clock = releaseWords(h, now);
    return { text: `Taken by ${h.by.name}${status}${clock.text}`, title: `Taken ${formatDateTime(h.takenAt)}${clock.title}` };
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
