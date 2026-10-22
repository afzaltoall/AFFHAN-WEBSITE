"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { formatDateTime } from "@/lib/datetime";
import { timeAgo } from "@/lib/relative-time";
import { leadStatusChip, leadStatusLabel } from "@/lib/leadStatus";
import type { HandlingStep, LeadKind } from "@/lib/lead-pool";
import type { Theme } from "@/components/admin/console-theme";

/**
 * "Handling history" in the console's inquiry popup: everything that happened to the customer behind it, oldest
 * first. It arrived; who took it and when; what they recorded; who let it go and why (released, auto-released, Not
 * attended); who took it next; how it ended. Read from the trail and the recorded outcomes
 * (GET /api/admin/handling, lib/lead-pool.ts) when the popup opens, never with the list.
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

  const line = dark ? "border-white/10" : "border-black/[0.08]";
  return (
    <section aria-labelledby={`handling-${id}`} className="mt-4">
      <p id={`handling-${id}`} className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${t.soft}`}>
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
        <ol className={`space-y-2 rounded-xl border-l-2 p-3 pl-4 ${t.thumb} ${line}`}>
          {state.steps.map((s, i) => (
            <li key={`${s.at}-${s.kind}-${i}`} className="text-[12.5px] leading-snug">
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                {s.kind === "STATUS" ? (
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${leadStatusChip(s.label)}`}>{leadStatusLabel(s.label)}</span>
                ) : (
                  <span className={`font-semibold ${t.strong}`}>{s.label}</span>
                )}
                {s.who && <span className={t.mid}>{s.kind === "STATUS" ? `by ${s.who}` : s.who}</span>}
                <span className={t.soft} title={formatDateTime(s.at)}>
                  · {formatDateTime(s.at)} ({timeAgo(s.at)})
                </span>
              </span>
              {s.note && <span className={`mt-0.5 block whitespace-pre-line ${t.soft}`}>{s.note}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default HandlingHistory;
