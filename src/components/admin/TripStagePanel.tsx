"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Check } from "lucide-react";
import { LIGHT_THEME, type Theme } from "@/components/admin/console-theme";

type Stage = "open" | "checking" | "drawing" | "announced" | "dates";

interface StageState {
  stage: Stage;
  changedBy: string | null;
  changedAt: string | null;
}

/** The stages, in order, as the team calls them, and what applicants then see on their page. */
const STAGES: { id: Stage; label: string; sees: string }[] = [
  { id: "open", label: "Applications open", sees: "Their application received; the eligibility check comes next." },
  { id: "checking", label: "Eligibility check", sees: "The eligibility check, happening now." },
  { id: "drawing", label: "Random draw", sees: "The eligibility check done; the random draw happening now." },
  { id: "announced", label: "Winners announced", sees: "The draw done; the winners announced and being contacted." },
  { id: "dates", label: "Trip date shared", sees: "Every step done: the trip date and plan sent to the winners." },
];

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";

/**
 * The Free China Business Trip's stage, from the console (lib/trip-stage.ts;
 * the owner's choice of 2026-10-07): the team moves it as each step after the
 * applications starts, and every applicant's "What happens next" on the
 * participants page follows within seconds. The five steps in a row, the
 * current one filled; choosing another asks first, in words, so a slip of the
 * mouse never moves it. Read again every 30 seconds, so a move made by
 * another admin shows here. In the console's palette (`t`, `dark`).
 */
export function TripStagePanel({ t = LIGHT_THEME, dark = false }: { t?: Theme; dark?: boolean }) {
  const [state, setState] = useState<StageState | null>(null);
  const [asking, setAsking] = useState<Stage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/trip-stage/", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as StageState | null;
      if (!res.ok || !json?.stage) throw new Error();
      setError(null);
      setState(json);
    } catch {
      setError("Could not read the stage. Applicants' pages keep showing the last one saved.");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const move = useCallback(async (stage: Stage) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/trip-stage/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (res.status === 401) throw new Error("Your session has ended. Sign in again, then move it.");
      const json = (await res.json().catch(() => null)) as StageState | null;
      if (!res.ok || !json?.stage) throw new Error("That change did not save. Try again.");
      setState(json);
      setAsking(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "That change did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const at = state ? STAGES.findIndex((s) => s.id === state.stage) : -1;
  const current = at >= 0 ? STAGES[at] : null;
  const target = asking ? STAGES.find((s) => s.id === asking) : null;
  const done = dark ? "bg-amber-400 text-[#1d1d1f]" : "bg-amber-500 text-white";
  const now = dark ? "bg-white text-[#1d1d1f] ring-2 ring-amber-400" : "bg-[#1d1d1f] text-white ring-2 ring-amber-500";
  const ahead = dark ? "bg-white/[0.06] text-white/70 ring-1 ring-white/[0.12] hover:bg-white/[0.1]" : "bg-white text-[#48484a] ring-1 ring-black/[0.1] hover:bg-black/[0.03]";

  return (
    <section id="trip-stage" aria-labelledby={titleId} className={`mb-5 scroll-mt-24 rounded-2xl p-4 shadow-sm ring-1 sm:p-5 ${t.card}`}>
      <h2 id={titleId} className={`flex flex-wrap items-center gap-2 text-[15px] font-semibold ${t.strong}`}>
        What happens next
        {current && (
          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${dark ? "bg-amber-400/15 text-amber-300" : "bg-amber-500/15 text-amber-800"}`}>Now: {current.label}</span>
        )}
      </h2>
      <p className={`mt-1 max-w-[70ch] text-[13px] leading-snug ${t.mid}`}>
        Applicants see these steps on their page. Move it on when a step starts, and every applicant&apos;s page follows within a few seconds.
      </p>

      <ol className="mt-3 flex flex-wrap gap-2">
        {STAGES.map((s, i) => {
          const isNow = i === at;
          const isDone = at >= 0 && (i < at || (i === at && s.id === "dates"));
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={!state || busy || isNow}
                aria-pressed={isNow}
                onClick={() => setAsking(s.id)}
                className={`inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-colors disabled:cursor-default ${isDone && !isNow ? done : isNow ? now : ahead}`}
              >
                <span aria-hidden className="tabular-nums">{isDone ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      {target && (
        <div role="alertdialog" aria-label={`Move to ${target.label}`} className={`mt-3 flex flex-wrap items-center gap-3 rounded-xl px-3.5 py-2.5 ${dark ? "bg-white/[0.05]" : "bg-[#f5f5f7]"}`}>
          <p className={`text-[13px] ${t.strong}`}>
            Move to <strong>{target.label}</strong>? Applicants will see: {target.sees}
          </p>
          <span className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void move(target.id)}
              className={`h-8 rounded-full px-3.5 text-[12.5px] font-semibold ${dark ? "bg-white text-[#1d1d1f]" : "bg-[#1d1d1f] text-white"} disabled:opacity-60`}
            >
              {busy ? "Moving…" : "Yes, move it"}
            </button>
            <button type="button" disabled={busy} onClick={() => setAsking(null)} className={`h-8 rounded-full px-3.5 text-[12.5px] font-medium ring-1 ${dark ? "text-white ring-white/[0.15]" : "text-[#1d1d1f] ring-black/[0.12]"}`}>
              Cancel
            </button>
          </span>
        </div>
      )}

      {state && (
        <p className={`mt-2 text-[12px] ${t.soft}`}>
          {state.changedBy && state.changedAt ? `Moved to ${current?.label ?? state.stage} by ${state.changedBy}, ${fmt(state.changedAt)}.` : "Not moved yet: applicants see applications open."}
        </p>
      )}
      {error && (
        <p role="alert" className={`mt-1.5 text-[12.5px] font-medium ${dark ? "text-red-400" : "text-red-700"}`}>
          {error}
        </p>
      )}
    </section>
  );
}
