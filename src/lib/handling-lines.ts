import { POOL_EVENT, poolKindLabel, staffWord } from "./lead-pool-rules";
import { describeStatus } from "./inquiry-status";
import type { HandlingStep } from "./lead-pool";

/**
 * The console's "Handling history" as lines, in plain words (the owner, 2026-11-17: "handling history is too complex,
 * the UI is not good"; drawn by components/admin/HandlingHistory.tsx): one line a step, and under a step, what the
 * request's customer read after it, when that step is what moved it. Here, apart from the drawing, so it is tested
 * (tests/lead-pool/handling-lines.test.mjs).
 */

/** What the customer read after a move: the status in their own word, and the team's words that went with it. */
export interface Told {
  text: string;
  note: string | null;
}

/** A line of the history: what happened, who did it, and what the customer read after it. */
export interface HistoryLine {
  at: string;
  title: string;
  /** A salesperson's recorded outcome (Lead, No lead…), drawn as its chip instead of a title. */
  outcome: string | null;
  who: string | null;
  note: string | null;
  told: Told[];
  /** This step can change what the customer reads (see `causes`), so the move it made goes under it. */
  causes: boolean;
  /** A customer move standing by itself (set from the popup), kept so a step that caused it can take it under it. */
  alone?: Told;
}

/** "(marked by Admin)" in the pool's notes: who pressed it. */
const markedBy = (note: string | null) => /\(marked by ([^)]+)\)/.exec(note ?? "")?.[1] ?? null;

/** Setting a request to New again, in the pool's trail: "a request to deal with again (marked by …)". */
const isNewAgain = (s: HandlingStep) => s.kind === POOL_EVENT.REOPENED && (s.note ?? "").startsWith("a request to deal with again");

/** A step of the pool's trail, or an outcome, in plain words. */
function plain(s: HandlingStep): Pick<HistoryLine, "title" | "outcome" | "who" | "note"> {
  const held = s.who ? `held by ${s.who}` : null;
  switch (s.kind) {
    case "ARRIVED":
      return { title: "Request arrived", outcome: null, who: null, note: null };
    case "STATUS":
      return { title: "", outcome: s.label, who: s.who ? `by ${s.who}` : null, note: s.note };
    case POOL_EVENT.DONE: {
      // Every request of theirs marked Handled, Spam or deleted.
      const by = markedBy(s.note);
      return { title: "Marked done", outcome: null, who: by ? `by ${by}` : held, note: null };
    }
    case POOL_EVENT.REOPENED: {
      if (isNewAgain(s)) {
        const by = markedBy(s.note);
        return { title: "Set to New again", outcome: null, who: by ? `by ${by}` : null, note: null };
      }
      return { title: "Another request arrived", outcome: null, who: null, note: null };
    }
    case POOL_EVENT.JOINED:
      return { title: "Another request arrived", outcome: null, who: held, note: null };
    case POOL_EVENT.AUTO_RELEASED:
      return { title: "Released automatically", outcome: null, who: held, note: s.note };
    case POOL_EVENT.INVALIDATED:
      return { title: "Given up after a week unhandled", outcome: null, who: held, note: null };
    case POOL_EVENT.ADMIN_UNASSIGNED: {
      const by = /released to the pool by (.+)$/.exec(s.note ?? "")?.[1];
      return { title: "Released", outcome: null, who: by ? `by ${by}` : held, note: null };
    }
    case POOL_EVENT.RESOLVED:
      return { title: "Completed", outcome: null, who: s.who ? `${staffWord(s.kind)} ${s.who}` : null, note: s.note };
    default:
      return { title: poolKindLabel(s.kind), outcome: null, who: s.who ? `${staffWord(s.kind)} ${s.who}` : null, note: s.note };
  }
}

/** What the customer read after a move (a CUSTOMER step: the status code as its label). */
function toldOf(s: HandlingStep): Told {
  const code = s.label;
  if (code === "CUSTOM") return { text: "Customer now sees your message", note: s.note };
  const word = describeStatus(code, null).label;
  // The moves the console makes itself carry its own bookkeeping, never shown to the customer.
  const note = s.note && s.note !== "Set to New again" && s.note !== "Inquiry submitted" ? s.note : null;
  return { text: `Customer now sees ${word}`, note };
}

/**
 * The steps that change what a request's customer reads (lib/inquiry-checked.ts): marking it done (Handled), setting it
 * to New again, and a salesperson's Lead or No lead, which marks their requests Handled. Never an arrival, a take or a
 * release: a status set in the same minute as another request arrived is not that request's doing.
 */
function causes(s: HandlingStep): boolean {
  return s.kind === "STATUS" || s.kind === POOL_EVENT.DONE || s.kind === POOL_EVENT.RESOLVED || s.kind === POOL_EVENT.REQUESTS_CLOSED || isNewAgain(s);
}

/** Within 90 s of each other: one press's doings (a customer move is saved a moment before the pool's step for it). */
const together = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) <= 90_000;

/** Two lines by the same hand, or one of them by nobody named. */
const sameHand = (a: string | null, b: string | null) => a === null || b === null || a === b;

/**
 * The history's lines, from its steps oldest first: each step in plain words, and a customer move under the step that
 * caused it, whichever of the two was saved first (Handled's "Customer now sees Checked" is saved a moment before
 * "Marked done"). One move a step, since a step moves this request once: a second is a press of its own. A move
 * nothing caused stands by itself: one set from the popup (Confirmed, Closed with its reason, a message of the team's
 * own), or a Handled that left the customer's other requests open, so the pool recorded nothing for it.
 */
export function linesOf(steps: HandlingStep[]): HistoryLine[] {
  const lines: HistoryLine[] = [];
  for (const s of steps) {
    const last = lines[lines.length - 1];
    if (s.kind === "CUSTOMER") {
      const told = toldOf(s);
      const who = s.who ? `by ${s.who}` : null;
      // Saved just after the step that caused it.
      if (last?.causes && !last.told.length && together(s.at, last.at) && sameHand(last.who, who)) {
        last.told.push(told);
      } else {
        lines.push({ at: s.at, title: told.text, outcome: null, who, note: told.note, told: [], causes: false, alone: told });
      }
      continue;
    }
    const line: HistoryLine = { at: s.at, ...plain(s), told: [], causes: causes(s) };
    // Saved just before the step that caused it (the popup writes what the customer reads first, then the mark).
    if (line.causes && last?.alone && together(s.at, last.at) && sameHand(line.who, last.who)) {
      lines.pop();
      line.told.push(last.alone);
    }
    lines.push(line);
  }
  return lines;
}
