"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, Search, X } from "lucide-react";
import { TripDocuments } from "@/components/admin/TripApplicationsBoard";
import { IdProofLockLine } from "@/components/admin/IdProofLock";
import type { DuplicateApplicationView, DuplicateGroupView, DuplicatesView } from "@/lib/server/trip-duplicates";
import { DUPLICATE_REASON_LABEL, apartLabel } from "@/lib/trip-duplicates";
import { rupees } from "@/lib/trip-referral-shared";

/**
 * Employee tasks → Duplicates (the owner, 2026-11-23: "duplicate oru option kondu vaa ... duplicate click pana evalo
 * peru same users check pananum ... we are going to give real money to employees"): one card a person who may have
 * applied more than once (lib/trip-duplicates.ts says what joins them), their applications oldest first with the
 * employee each came through and the ID proof each sent, side by side, and the one question to answer: the same person?
 * Yes takes the later ones out (Not counted); No keeps them (Keep), each recorded as the application's own decision.
 */

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const pill = "inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium ring-1 ring-black/[0.08] transition-colors disabled:opacity-50";

/** Strong evidence (the same ID file or number), only the name, decided, or everything. */
type Tab = "sure" | "name" | "checked" | "all";
type Decide = (ids: string[], state: "counted" | "not_counted") => Promise<boolean>;

/** Where an application stands in its group, as a few words. */
function standing(a: DuplicateApplicationView, first: boolean, toCheck: boolean): string {
  if (!a.employee) return "Applied without a link";
  if (a.paid) return "Paid";
  if (toCheck) return "To check";
  if (a.referralState === "not_counted") return "Not counted";
  if (a.referralState === "waiting") return "Waiting";
  if (first) return "Counted";
  return a.decidedAt ? "Kept" : "Counted";
}

/** What joins a group, in plain words: the reasons, then what makes it likelier. */
function whyLine(g: DuplicateGroupView): string {
  const linked = g.applications.filter((a) => a.employee);
  const through = g.oneEmployee && linked[0]?.employee ? `${linked.length === 2 ? "Both" : "All"} through ${linked[0].employee.name}'s link` : "";
  return [...g.reasons.map((r) => DUPLICATE_REASON_LABEL[r]), through, apartLabel(g.closestMinutes), g.numbersOneDigitApart ? "Mobile numbers one digit apart" : ""]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A decision shown at once, while the list is read again: the applications just decided leave "to check" with the state
 * chosen, and the counts and rupees follow. The read that comes next replaces it all.
 */
export function decidedLocally(data: DuplicatesView, ids: readonly string[], state: "counted" | "not_counted"): DuplicatesView {
  const decided = new Set(ids);
  const now = new Date().toISOString();
  const byEmployee = { ...data.byEmployee };
  let applications = data.toCheck.applications;
  let points = 0;
  const groups = data.groups.map((g) => {
    if (!g.ids.some((id) => decided.has(id))) return g;
    for (const a of g.applications) {
      if (!decided.has(a.id) || !g.toCheck.includes(a.id)) continue;
      applications--;
      points += a.referralPoints ?? 0;
      if (a.employee) {
        const left = (byEmployee[a.employee.id] ?? 1) - 1;
        if (left > 0) byEmployee[a.employee.id] = left;
        else delete byEmployee[a.employee.id];
      }
    }
    return {
      ...g,
      toCheck: g.toCheck.filter((id) => !decided.has(id)),
      applications: g.applications.map((a) => (decided.has(a.id) && a.employee && !a.paid ? { ...a, referralState: state, decidedAt: now, decidedBy: null } : a)),
    };
  });
  return {
    ...data,
    groups,
    byEmployee,
    toCheck: {
      people: groups.filter((g) => g.toCheck.length > 0).length,
      applications: Math.max(0, applications),
      rupees: Math.max(0, data.toCheck.rupees - points * data.rupeesPerPoint),
    },
  };
}

/**
 * Each application's line for the Excel export (by Trip ID): where it stands in its group, what joins it, and the
 * others' Trip IDs. Applications in no group have none.
 */
export function duplicateNotes(data: DuplicatesView): Map<string, string> {
  const notes = new Map<string, string>();
  for (const g of data.groups) {
    const toCheck = new Set(g.toCheck);
    const reasons = g.reasons.map((r) => DUPLICATE_REASON_LABEL[r]).join(", ");
    g.applications.forEach((a, i) => {
      const others = g.applications.filter((o) => o.id !== a.id).map((o) => o.referenceNo).join(", ");
      notes.set(a.referenceNo, `${i === 0 ? "First" : standing(a, false, toCheck.has(a.id))} · ${reasons} · with ${others}`);
    });
  }
  return notes;
}

export function ReferralDuplicates({
  data,
  failed,
  reading,
  busy,
  employee,
  onClearEmployee,
  onBack,
  onRetry,
  onDecide,
}: {
  /** Null until the first read arrives. */
  data: DuplicatesView | null;
  failed: boolean;
  /** A read is on its way (the first, or again after a change). */
  reading: boolean;
  busy: boolean;
  /** Only this employee's (a row's "to check"), or everyone's. */
  employee: { id: string; name: string } | null;
  onClearEmployee: () => void;
  onBack: () => void;
  onRetry: () => void;
  onDecide: Decide;
}) {
  const [picked, setPicked] = useState<Tab | null>(null);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");

  const mine = useMemo(() => {
    const groups = data?.groups ?? [];
    if (!employee) return groups;
    return groups.filter((g) => g.applications.some((a) => a.employee?.id === employee.id));
  }, [data, employee]);
  /** Whether a group has something of theirs (or anyone's, without a filter) still to decide. */
  const open = (g: DuplicateGroupView) =>
    employee ? g.applications.some((a) => a.employee?.id === employee.id && g.toCheck.includes(a.id)) : g.toCheck.length > 0;
  /** The same ID file or mobile number: strong evidence. Only the name: the ID proofs say. */
  const strong = (g: DuplicateGroupView) => g.reasons[0] !== "name";
  const counts = {
    sure: mine.filter((g) => open(g) && strong(g)).length,
    name: mine.filter((g) => open(g) && !strong(g)).length,
    checked: mine.filter((g) => !open(g)).length,
    all: mine.length,
  };
  // It opens on the strong ones; with none, the names; then everything. Chosen once, when the list arrives (and again for
  // another employee's), so deciding the last one on a tab never moves the list to another under the pointer.
  const opening: Tab = counts.sure ? "sure" : counts.name ? "name" : "all";
  const [pickedFor, setPickedFor] = useState(employee?.id ?? null);
  if ((employee?.id ?? null) !== pickedFor) {
    setPickedFor(employee?.id ?? null);
    setPicked(null);
  }
  useEffect(() => {
    if (data && picked === null) setPicked(opening);
  }, [data, picked, opening]);
  const tab: Tab = picked ?? opening;
  const matches = (g: DuplicateGroupView) =>
    !needle ||
    g.applications.some(
      (a) =>
        [a.fullName, a.referenceNo, a.city, a.country, a.employee?.name ?? "", a.employee?.code ?? ""].join(" ").toLowerCase().includes(needle) ||
        (digits.length >= 4 && a.phone.replace(/\D/g, "").includes(digits)),
    );
  const shown = mine
    .filter((g) => (tab === "sure" ? open(g) && strong(g) : tab === "name" ? open(g) && !strong(g) : tab === "checked" ? !open(g) : true))
    .filter(matches);

  // What is still to decide, for everyone or for the one employee: applications and what they come to.
  const waiting = mine.flatMap((g) => g.applications.filter((a) => g.toCheck.includes(a.id) && (!employee || a.employee?.id === employee.id)));
  const waitingRupees = waiting.reduce((s, a) => s + (a.referralPoints ?? 0), 0) * (data?.rupeesPerPoint ?? 0);
  const anyFiles = shown.some((g) => g.applications.some((a) => a.documents.length));

  return (
    <section aria-labelledby="duplicates-title" className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.06]">
      <div className="flex flex-wrap items-center gap-3 border-b border-black/[0.06] px-5 py-2.5">
        <button type="button" onClick={onBack} aria-label="Back to employees" className="-ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05]">
          <ArrowLeft size={16} />
        </button>
        <h2 id="duplicates-title" className="text-[15px] font-semibold">
          Duplicates
        </h2>
        {employee && (
          <span className="inline-flex h-8 items-center gap-1 rounded-full bg-black/[0.05] pl-3 pr-1 text-[12.5px] font-medium">
            {employee.name}
            <button type="button" onClick={onClearEmployee} aria-label="Show everyone's" className="flex h-6 w-6 items-center justify-center rounded-full text-[#6e6e73] hover:bg-black/[0.06] hover:text-[#1d1d1f]">
              <X size={13} />
            </button>
          </span>
        )}
        {mine.length > 0 && (
          <label className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <span className="sr-only">Search duplicates</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && q) setQ("");
              }}
              placeholder="Search name, mobile, Trip ID or employee"
              className="h-8 w-full rounded-full bg-white pl-9 pr-4 text-[13px] outline-none ring-1 ring-black/[0.08] focus:ring-2 focus:ring-[#0071e3]/40"
            />
          </label>
        )}
        {reading && data && <span className="ml-auto text-[12px] text-[#86868b]" aria-live="polite">Checking again…</span>}
      </div>

      {!data ? (
        failed ? (
          <div role="alert" className="px-5 py-10 text-center text-[13px] text-[#48484a]">
            Duplicates could not be checked just now.{" "}
            <button type="button" onClick={onRetry} className="font-medium text-[#0058b0] hover:underline">
              Try again
            </button>
          </div>
        ) : (
          <div className="animate-pulse space-y-3 px-5 py-5" aria-busy="true" aria-label="Checking for duplicates">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl px-4 py-4 ring-1 ring-black/[0.06]">
                <span className="block h-[14px] w-1/3 rounded bg-black/[0.07]" />
                <span className="mt-2 block h-[12px] w-1/2 rounded bg-black/[0.07]" />
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.06] px-5 py-2.5">
            {(
              [
                ["sure", "Same ID file or number", counts.sure],
                ["name", "Same name and city", counts.name],
                ["checked", "Checked", counts.checked],
                ["all", "All", counts.all],
              ] as const
            ).map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPicked(id)}
                aria-pressed={tab === id}
                className={`${pill} ${tab === id ? "bg-[#1d1d1f] text-white ring-transparent" : "bg-white hover:bg-black/[0.03]"}`}
              >
                {label} <span className={`tabular-nums ${tab === id ? "text-white/70" : "text-[#86868b]"}`}>{n}</span>
              </button>
            ))}
            <p className="ml-auto text-[13px] text-[#48484a]" aria-live="polite">
              {waiting.length ? (
                <>
                  <span className="font-semibold tabular-nums text-amber-800">{waiting.length}</span> {waiting.length === 1 ? "application" : "applications"} to check
                  {waitingRupees > 0 && <span className="text-[#6e6e73]"> · {rupees(waitingRupees)}</span>}
                </>
              ) : (
                "Nothing left to check"
              )}
            </p>
          </div>
          {failed && (
            <p role="alert" className="border-b border-black/[0.06] bg-amber-500/10 px-5 py-2.5 text-[13px] font-medium text-amber-800">
              This list may be out of date: it could not be read again.{" "}
              <button type="button" onClick={onRetry} className="underline">
                Try again
              </button>
            </p>
          )}
          {data.filesUnchecked > 0 && (
            <p role="status" className="flex flex-wrap items-center gap-x-2 border-b border-black/[0.06] bg-amber-500/10 px-5 py-2.5 text-[13px] font-medium text-amber-800">
              {data.filesUnchecked} {data.filesUnchecked === 1 ? "ID file" : "ID files"} could not be compared just now.
              <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 underline">
                <RefreshCw size={13} /> Check again
              </button>
            </p>
          )}
          {anyFiles && <IdProofLockLine className="border-b border-black/[0.06] px-5 py-2" />}
          {shown.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-[#86868b]">
              {needle ? (
                <>
                  Nothing matches “{q.trim()}”.{" "}
                  <button type="button" onClick={() => setQ("")} className="font-medium text-[#0058b0] hover:underline">
                    Clear search
                  </button>
                </>
              ) : tab === "sure" ? (
                employee ? `Nothing of ${employee.name}'s shares an ID file or a number.` : "Nothing left shares an ID file or a mobile number."
              ) : tab === "name" ? (
                employee ? `Nothing of ${employee.name}'s is left to check.` : "Nothing left to check."
              ) : tab === "checked" ? (
                "Nothing checked yet."
              ) : (
                "Nobody has applied twice."
              )}
            </p>
          ) : (
            <ol className="divide-y divide-black/[0.06]">
              {shown.map((g) => (
                <Group key={g.ids[0]} g={g} busy={busy} onDecide={onDecide} />
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

/** One person who may have applied more than once: why, their applications oldest first, and the question. */
function Group({ g, busy, onDecide }: { g: DuplicateGroupView; busy: boolean; onDecide: Decide }) {
  const first = g.applications[0];
  const toCheck = new Set(g.toCheck);
  const n = g.toCheck.length;
  return (
    <li className="px-5 py-4" aria-label={`${first.fullName}, ${g.applications.length} applications`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold">
            {first.fullName}
            {first.city && <span className="font-normal text-[#6e6e73]"> · {first.city}</span>}
          </h3>
          <p className="mt-0.5 text-[13px] text-[#48484a]">{whyLine(g)}</p>
        </div>
        <span className={`text-[13px] ${n ? "font-semibold text-amber-800" : "text-[#6e6e73]"}`}>{n ? `${n} to check` : "Checked"}</span>
      </div>

      <ol className="mt-3 divide-y divide-black/[0.06] overflow-hidden rounded-xl ring-1 ring-black/[0.08]">
        {g.applications.map((a, i) => (
          <Application key={a.id} a={a} first={i === 0} toCheck={toCheck.has(a.id)} busy={busy} onDecide={onDecide} />
        ))}
      </ol>

      {n > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[13px] font-semibold">Same person?</span>
          <button type="button" disabled={busy} onClick={() => void onDecide(g.toCheck, "not_counted")} className={`${pill} bg-white hover:bg-black/[0.03]`}>
            {n === 1 ? "Yes, don’t count again" : `Yes, don’t count the ${n} later ones`}
          </button>
          <button type="button" disabled={busy} onClick={() => void onDecide(g.toCheck, "counted")} className={`${pill} bg-white hover:bg-black/[0.03]`}>
            No, different people
          </button>
        </div>
      )}
    </li>
  );
}

function Application({ a, first, toCheck, busy, onDecide }: { a: DuplicateApplicationView; first: boolean; toCheck: boolean; busy: boolean; onDecide: Decide }) {
  const word = standing(a, first, toCheck);
  const who = a.decidedBy && !toCheck ? `${a.decidedBy}${a.decidedAt ? `, ${fmtWhen(a.decidedAt)}` : ""}` : null;
  const canChange = !!a.employee && !a.paid && !toCheck;
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">
            {a.fullName}
            <span className="ml-2 font-mono text-[12.5px] font-normal text-[#0058b0]">{a.referenceNo}</span>
            {first && <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 align-middle text-[11px] font-medium text-[#6e6e73]">First</span>}
          </p>
          <p className="mt-0.5 text-[12.5px] text-[#48484a]">
            <span className="tabular-nums">{a.phone}</span>
            {[a.city, a.country].filter(Boolean).length > 0 && <span> · {[a.city, a.country].filter(Boolean).join(", ")}</span>}
            <span> · {fmtWhen(a.createdAt)}</span>
          </p>
          <p className="mt-0.5 text-[12.5px] text-[#6e6e73]">
            {a.employee ? (
              <>
                Through {a.employee.name}&apos;s link{a.employee.code && <span className="font-mono"> {a.employee.code}</span>}
              </>
            ) : (
              "Sent without an employee's link"
            )}
          </p>
        </div>
        {a.employee && (
          <div className="flex flex-col items-end gap-1 text-[12.5px]">
            {toCheck ? (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <span className="mr-1 font-semibold text-amber-800">To check</span>
                <button type="button" disabled={busy} onClick={() => void onDecide([a.id], "counted")} className={`${pill} bg-white hover:bg-black/[0.03]`}>
                  Keep
                </button>
                <button type="button" disabled={busy} onClick={() => void onDecide([a.id], "not_counted")} className={`${pill} bg-white hover:bg-black/[0.03]`}>
                  Not counted
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className={a.paid || word === "Counted" || word === "Kept" ? "font-medium text-emerald-700" : "text-[#6e6e73]"}>
                  {word}
                  {(word === "Counted" || word === "Kept") && ` · ${a.referralPoints ?? 0} points`}
                </span>
                {canChange && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDecide([a.id], a.referralState === "counted" ? "not_counted" : "counted")}
                    className="text-[12px] font-medium text-[#0058b0] hover:underline disabled:opacity-50"
                  >
                    {a.referralState === "counted" ? "Not counted" : "Count"}
                  </button>
                )}
              </div>
            )}
            {who && <span className="text-[11.5px] text-[#86868b]">{who}</span>}
          </div>
        )}
      </div>
      {a.documents.length > 0 ? (
        <div className="mt-2.5">
          <TripDocuments documents={a.documents} compact />
        </div>
      ) : a.employee ? (
        <p className="mt-1.5 text-[12.5px] text-[#86868b]">No ID proof</p>
      ) : null}
    </li>
  );
}
