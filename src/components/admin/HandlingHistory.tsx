"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { formatDateTime, formatShortWhen } from "@/lib/datetime";
import { timeAgo } from "@/lib/relative-time";
import { leadStatusChip, leadStatusLabel } from "@/lib/leadStatus";
import { POOL_EVENT, poolKindLabel, staffWord } from "@/lib/lead-pool-rules";
import { describeStatus } from "@/lib/inquiry-status";
import type { HandlingStep, LeadKind } from "@/lib/lead-pool";
import type { Theme } from "@/components/admin/console-theme";

/**
 * "Handling history" in the console's popups: what happened to the customer behind a request, oldest first, in plain
 * words (the owner, 2026-11-17: "handling history is too complex, the UI is not good"). The request arriving; each thing
 * somebody did (marked done, set to New again, taken, released, Lead or No lead); and, for a quote request, what its
 * customer read after it (Received, Checked, Confirmed, Closed and the reason), under the step that caused it. One line
 * a step, its time short ("10:41 AM" today), the whole date on hover. The pool's own wording (out of the pool, a new
 * week) stays on its own pages; here, only what it means. Read from the trail, the outcomes and the request's status
 * moves (GET /api/admin/handling, lib/lead-pool.ts) when the popup opens, never with the list.
 */

type PanelTheme = Pick<Theme, "soft" | "mid" | "strong" | "pill" | "thumb">;
type State = { status: "loading" } | { status: "error" } | { status: "done"; steps: HandlingStep[] };

/** A line of the history: what happened, who did it, and what the customer read after it. */
interface Line {
  at: string;
  title: string;
  /** A salesperson's recorded outcome (Lead, No lead…), drawn as its chip instead of a title. */
  outcome: string | null;
  who: string | null;
  note: string | null;
  told: { text: string; note: string | null }[];
  /** A customer move standing by itself (set from the popup), kept so a step that caused it can take it under it. */
  alone?: { text: string; note: string | null };
}

/** "(marked by Admin)" in the pool's notes: who pressed it. */
const markedBy = (note: string | null) => /\(marked by ([^)]+)\)/.exec(note ?? "")?.[1] ?? null;

/** A step of the pool's trail, or an outcome, in plain words. */
function plain(s: HandlingStep): Omit<Line, "at" | "told"> {
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
      if ((s.note ?? "").startsWith("a request to deal with again")) {
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

/** What the customer read after a move: the status in their own word, and the team's words that went with it. */
function toldOf(s: HandlingStep): { text: string; note: string | null } {
  const code = s.label;
  if (code === "CUSTOM") return { text: "Customer now sees your message", note: s.note };
  const word = describeStatus(code, null).label;
  // The moves the console makes itself carry its own bookkeeping, never shown to the customer.
  const note = s.note && s.note !== "Set to New again" && s.note !== "Inquiry submitted" ? s.note : null;
  return { text: `Customer now sees ${word}`, note };
}

/** Within 90 s of each other: one press's doings (a customer move is saved a moment before the pool's step for it). */
const together = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) <= 90_000;

/**
 * The history's lines: each step in plain words, and a customer move under the step that caused it, whichever of the
 * two was saved first (Handled's "Customer now sees Checked" is saved a moment before "Marked done"). A move nothing
 * caused stands by itself: one set from the popup (Confirmed, Closed with its reason, a message of the team's own).
 */
function linesOf(steps: HandlingStep[]): Line[] {
  const lines: Line[] = [];
  for (const s of steps) {
    const last = lines[lines.length - 1];
    if (s.kind === "CUSTOMER") {
      const told = toldOf(s);
      if (last && !last.alone && last.title !== "Request arrived" && together(s.at, last.at)) {
        last.told.push(told);
      } else {
        lines.push({ at: s.at, title: told.text, outcome: null, who: s.who ? `by ${s.who}` : null, note: told.note, told: [], alone: told });
      }
      continue;
    }
    const line: Line = { at: s.at, ...plain(s), told: [] };
    // The customer's move just before, by the same person: this step caused it, so it goes under this step.
    if (last?.alone && together(s.at, last.at) && (line.who === null || line.who === last.who)) {
      lines.pop();
      line.told.push(last.alone);
    }
    lines.push(line);
  }
  return lines;
}

export function HandlingHistory({ kind, id, t, dark }: { kind: LeadKind; id: string; t: PanelTheme; dark: boolean }) {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await fetch(`/api/admin/handling/?kind=${kind}&id=${encodeURIComponent(id)}`, { signal, cache: "no-store" });
        if (!res.ok) return setState({ status: "error" });
        const data = (await res.json()) as { steps: HandlingStep[] };
        setState({ status: "done", steps: data.steps });
      } catch (error) {
        if ((error as Error).name !== "AbortError") setState({ status: "error" });
      }
    },
    [kind, id],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const rule = dark ? "border-white/10" : "border-black/[0.06]";
  return (
    <section aria-labelledby={`handling-${id}`} className="mt-4">
      <p id={`handling-${id}`} className={`mb-1.5 text-[13px] font-medium ${t.mid}`}>
        Handling history
      </p>
      {state.status === "loading" && <div className={`h-16 animate-pulse rounded-xl ${t.thumb}`} aria-busy="true" aria-label="Loading the handling history" />}
      {state.status === "error" && (
        <div role="alert" className={`flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-sm ${t.thumb}`}>
          <span className={t.mid}>The history could not be loaded.</span>
          <button
            type="button"
            onClick={() => { setState({ status: "loading" }); void load(); }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${t.pill}`}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
          </button>
        </div>
      )}
      {state.status === "done" && (
        <ol className={`rounded-xl px-3 ${t.thumb}`}>
          {linesOf(state.steps).map((l, i) => (
            <li key={`${l.at}-${i}`} className={`flex items-start gap-3 py-2.5 text-[12.5px] leading-snug ${i ? `border-t ${rule}` : ""}`}>
              <div className="min-w-0 flex-1">
                <p>
                  {l.outcome ? (
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${leadStatusChip(l.outcome)}`}>{leadStatusLabel(l.outcome)}</span>
                  ) : (
                    <span className={`font-semibold ${t.strong}`}>{l.title}</span>
                  )}
                  {l.who && <span className={t.mid}> {l.who}</span>}
                </p>
                {l.told.map((x, j) => (
                  <p key={j} className={`mt-0.5 ${t.mid}`}>
                    {x.text}
                    {x.note && <span className={t.soft}>: {x.note}</span>}
                  </p>
                ))}
                {l.note && <p className={`mt-0.5 whitespace-pre-line ${t.soft}`}>{l.note}</p>}
              </div>
              <time dateTime={l.at} title={`${formatDateTime(l.at)} (${timeAgo(l.at)})`} className={`shrink-0 tabular-nums ${t.soft}`}>
                {formatShortWhen(l.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default HandlingHistory;
