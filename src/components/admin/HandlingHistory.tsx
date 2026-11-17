"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { formatDateTime, formatShortWhen } from "@/lib/datetime";
import { timeAgo } from "@/lib/relative-time";
import { leadStatusChip, leadStatusLabel } from "@/lib/leadStatus";
import { linesOf } from "@/lib/handling-lines";
import type { HandlingStep, LeadKind } from "@/lib/lead-pool";
import type { Theme } from "@/components/admin/console-theme";

/**
 * "Handling history" in the console's popups: what happened to the customer behind a request, oldest first, in plain
 * words (the owner, 2026-11-17: "handling history is too complex, the UI is not good"). The request arriving; each thing
 * somebody did (marked done, set to New again, taken, released, Lead or No lead); and, for a quote request, what its
 * customer read after it (Received, Checked, Confirmed, Closed and the reason), under the step that caused it. One line
 * a step, its time short ("10:41 AM" today), the whole date on hover. The pool's own wording (out of the pool, a new
 * week) stays on its own pages; here, only what it means. Read from the trail, the outcomes and the request's status
 * moves (GET /api/admin/handling, lib/lead-pool.ts) when the popup opens, never with the list; made into lines by
 * lib/handling-lines.ts.
 */

type PanelTheme = Pick<Theme, "soft" | "mid" | "strong" | "pill" | "thumb">;
type State = { status: "loading" } | { status: "error" } | { status: "done"; steps: HandlingStep[] };

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
