"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, Search, Trash2 } from "lucide-react";
import { TripDocuments } from "@/components/admin/TripApplicationsBoard";
import { IdProofLockLine } from "@/components/admin/IdProofLock";
import { EmployeePicker, type EmployeeChoice } from "@/components/admin/EmployeePicker";
import type { DuplicateApplicationView, DuplicateGroupView, DuplicatesView } from "@/lib/server/trip-duplicates";
import { DUPLICATE_REASON_LABEL, apartLabel, deletableRepeat } from "@/lib/trip-duplicates";
import { referralStateLabel, rupees } from "@/lib/trip-referral-shared";

/**
 * Employee tasks → Duplicates (the owner, 2026-11-23: "duplicate oru option kondu vaa ... duplicate click pana evalo
 * peru same users check pananum ... we are going to give real money to employees"): one card a person who may have
 * applied more than once (lib/trip-duplicates.ts says what joins them), their applications oldest first with the
 * employee each came through and the ID proof each sent, side by side, and the one question to answer: the same person?
 * Yes deletes the later ones (soft: Participants → Deleted, where they can be restored; out of the draw and the counts);
 * No keeps them (Keep), recorded as the application's own decision. A later one can also be Not counted, or Wrong
 * document (its ID proof is not an ID, or not theirs).
 *
 * The same day: "employees to check filter who is how many duplicates" (the employee filter, each with how many still
 * to check) and "give a overall delete option ... to delete the duplicates overall button": one button deletes every
 * certain repeat shown (the same mobile number, or the same ID file under the same name), asked first in the console's
 * own window. A card joined only by the name is never deleted that way: different people share names.
 */

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const pill = "inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium ring-1 ring-black/[0.08] transition-colors disabled:opacity-50";

/** Strong evidence (the same ID file or number), only the name, decided, or everything. */
type Tab = "sure" | "name" | "checked" | "all";
export type DuplicateDecision = "counted" | "not_counted" | "wrong_document";
type Decide = (ids: string[], state: DuplicateDecision) => Promise<boolean>;

/** Where an application stands in its group, as a few words. */
function standing(a: DuplicateApplicationView, first: boolean, toCheck: boolean): string {
  if (!a.employee) return "Applied without a link";
  if (a.paid) return "Paid";
  if (toCheck) return "To check";
  if (a.referralState !== "counted") return referralStateLabel(a.referralState);
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

/** The certain repeats of a group that may be deleted now. */
const sureToDelete = (g: DuplicateGroupView) => g.applications.filter((a) => g.sure.includes(a.id) && deletableRepeat(a));

/** The figures that follow from the groups: what is still to check, by employee, and what it comes to. */
function summarize(data: DuplicatesView, groups: DuplicateGroupView[]): DuplicatesView {
  const byEmployee: Record<string, number> = {};
  let applications = 0;
  let points = 0;
  for (const g of groups) {
    for (const a of g.applications) {
      if (!g.toCheck.includes(a.id)) continue;
      applications++;
      points += a.referralPoints ?? 0;
      if (a.employee) byEmployee[a.employee.id] = (byEmployee[a.employee.id] ?? 0) + 1;
    }
  }
  return {
    ...data,
    groups,
    byEmployee,
    toCheck: { people: groups.filter((g) => g.toCheck.length > 0).length, applications, rupees: points * data.rupeesPerPoint },
  };
}

/**
 * A decision shown at once, while the list is read again: the applications just decided leave "to check" with the state
 * chosen, and the counts and rupees follow. The read that comes next replaces it all.
 */
export function decidedLocally(data: DuplicatesView, ids: readonly string[], state: DuplicateDecision): DuplicatesView {
  const decided = new Set(ids);
  const now = new Date().toISOString();
  return summarize(
    data,
    data.groups.map((g) =>
      g.ids.some((id) => decided.has(id))
        ? {
            ...g,
            toCheck: g.toCheck.filter((id) => !decided.has(id)),
            applications: g.applications.map((a) => (decided.has(a.id) && a.employee && !a.paid ? { ...a, referralState: state, decidedAt: now, decidedBy: null } : a)),
          }
        : g,
    ),
  );
}

/** Deleted ones shown gone at once: out of their groups, and a group left with one application is no group. */
export function deletedLocally(data: DuplicatesView, ids: readonly string[]): DuplicatesView {
  const gone = new Set(ids);
  return summarize(
    data,
    data.groups
      .map((g) =>
        g.ids.some((id) => gone.has(id))
          ? {
              ...g,
              ids: g.ids.filter((id) => !gone.has(id)),
              toCheck: g.toCheck.filter((id) => !gone.has(id)),
              sure: g.sure.filter((id) => !gone.has(id)),
              applications: g.applications.filter((a) => !gone.has(a.id)),
            }
          : g,
      )
      .filter((g) => g.applications.length > 1),
  );
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
  onEmployee,
  onBack,
  onIdProofs,
  onRetry,
  onDecide,
  onDelete,
}: {
  /** Null until the first read arrives. */
  data: DuplicatesView | null;
  failed: boolean;
  /** A read is on its way (the first, or again after a change). */
  reading: boolean;
  busy: boolean;
  /** Only this employee's, or everyone's. */
  employee: string | null;
  onEmployee: (id: string | null) => void;
  onBack: () => void;
  /** To Employee tasks' other check, the ID proofs. */
  onIdProofs: () => void;
  onRetry: () => void;
  onDecide: Decide;
  /** Delete later applications as repeats; resolves true when it was done. */
  onDelete: (ids: string[]) => Promise<boolean>;
}) {
  const [picked, setPicked] = useState<Tab | null>(null);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState<DuplicateApplicationView[] | null>(null);
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");

  const mine = useMemo(() => {
    const groups = data?.groups ?? [];
    if (!employee) return groups;
    return groups.filter((g) => g.applications.some((a) => a.employee?.id === employee));
  }, [data, employee]);
  /** Everyone who brought somebody in a group, with how many of theirs are still to check, the most first. */
  const choices = useMemo<EmployeeChoice[]>(() => {
    const seen = new Map<string, string>();
    for (const g of data?.groups ?? []) for (const a of g.applications) if (a.employee) seen.set(a.employee.id, a.employee.name);
    return [...seen]
      .map(([id, name]) => ({ id, name, count: data?.byEmployee[id] ?? 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [data]);
  /** Whether a group has something of theirs (or anyone's, without a filter) still to decide. */
  const open = (g: DuplicateGroupView) => (employee ? g.applications.some((a) => a.employee?.id === employee && g.toCheck.includes(a.id)) : g.toCheck.length > 0);
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
  const [pickedFor, setPickedFor] = useState(employee);
  if (employee !== pickedFor) {
    setPickedFor(employee);
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
  const waiting = mine.flatMap((g) => g.applications.filter((a) => g.toCheck.includes(a.id) && (!employee || a.employee?.id === employee)));
  const waitingRupees = waiting.reduce((s, a) => s + (a.referralPoints ?? 0), 0) * (data?.rupeesPerPoint ?? 0);
  // The one button (2026-11-23): every certain repeat on the cards shown, and nothing joined only by a name.
  const deletable = shown.flatMap(sureToDelete);
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
        {data && (
          <EmployeePicker choices={choices} value={employee} onChange={onEmployee} everyone={data.toCheck.applications} label="to check" />
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
        <span className="ml-auto flex items-center gap-3">
          {reading && data && (
            <span className="text-[12px] text-[#86868b]" aria-live="polite">
              Checking again…
            </span>
          )}
          <button type="button" onClick={onIdProofs} className="text-[13px] font-medium text-[#0058b0] hover:underline">
            ID proofs
          </button>
        </span>
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
            {deletable.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setAsking(deletable)}
                className={`${pill} bg-white text-red-700 ring-red-500/25 hover:bg-red-500/10`}
              >
                <Trash2 size={14} aria-hidden="true" /> Delete {deletable.length} {deletable.length === 1 ? "duplicate" : "duplicates"}
              </button>
            )}
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
                "Nothing left shares an ID file or a mobile number."
              ) : tab === "name" || tab === "all" ? (
                "Nothing left to check."
              ) : (
                "Nothing checked yet."
              )}
            </p>
          ) : (
            <ol className="divide-y divide-black/[0.06]">
              {shown.map((g) => (
                <Group key={g.ids[0]} g={g} busy={busy} onDecide={onDecide} onDelete={onDelete} />
              ))}
            </ol>
          )}
        </>
      )}
      {asking && (
        <DeleteDuplicates
          who={asking}
          busy={busy}
          rupeesPerPoint={data?.rupeesPerPoint ?? 0}
          onCancel={() => setAsking(null)}
          onConfirm={async () => {
            if (await onDelete(asking.map((a) => a.id))) setAsking(null);
          }}
        />
      )}
    </section>
  );
}

/** One person who may have applied more than once: why, their applications oldest first, and the question. */
function Group({ g, busy, onDecide, onDelete }: { g: DuplicateGroupView; busy: boolean; onDecide: Decide; onDelete: (ids: string[]) => Promise<boolean> }) {
  const first = g.applications[0];
  const toCheck = new Set(g.toCheck);
  const n = g.toCheck.length;
  // Yes deletes the later ones still to check (never one drawn in the live draw: it stays, to be decided by itself).
  const repeats = g.applications.filter((a) => toCheck.has(a.id) && deletableRepeat(a));
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
          {repeats.length > 0 && (
            <button type="button" disabled={busy} onClick={() => void onDelete(repeats.map((a) => a.id))} className={`${pill} bg-white text-red-700 ring-red-500/25 hover:bg-red-500/10`}>
              {repeats.length === 1 ? "Yes, delete the later one" : `Yes, delete the ${repeats.length} later ones`}
            </button>
          )}
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
  const counting = a.referralState === "counted";
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">
            {a.fullName}
            <span className="ml-2 font-mono text-[12.5px] font-normal text-[#0058b0]">{a.referenceNo}</span>
            {first && <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 align-middle text-[11px] font-medium text-[#6e6e73]">First</span>}
            {a.drawn && <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 align-middle text-[11px] font-medium text-[#6e6e73]">In the lucky draw</span>}
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
                <button type="button" disabled={busy} onClick={() => void onDecide([a.id], "wrong_document")} className={`${pill} bg-white hover:bg-black/[0.03]`}>
                  Wrong document
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
                    onClick={() => void onDecide([a.id], counting ? "not_counted" : "counted")}
                    className="text-[12px] font-medium text-[#0058b0] hover:underline disabled:opacity-50"
                  >
                    {counting ? "Not counted" : "Count"}
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

/**
 * The one button's question, in the console's own window: how many, who (the first few), and what a delete does: soft,
 * restored from Participants → Deleted, out of the lucky draw and the counts, never paid.
 */
function DeleteDuplicates({
  who,
  busy,
  rupeesPerPoint,
  onCancel,
  onConfirm,
}: {
  who: DuplicateApplicationView[];
  busy: boolean;
  rupeesPerPoint: number;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!busy) onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, busy]);
  const counted = who.filter((a) => a.employee && a.referralState === "counted");
  const money = counted.reduce((s, a) => s + (a.referralPoints ?? 0), 0) * rupeesPerPoint;
  const listed = who.slice(0, 6);
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 px-4" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-duplicates-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 text-[#1d1d1f] shadow-2xl ring-1 ring-black/[0.06]"
      >
        <h2 id="delete-duplicates-title" className="text-[17px] font-semibold">
          Delete {who.length} duplicate {who.length === 1 ? "application" : "applications"}?
        </h2>
        <p className="mt-1.5 text-[13px] text-[#48484a]">
          Each is a later application of someone who applied before: the same mobile number, or the same ID file under the same
          name. {who.length === 1 ? "It goes" : "They go"} to Free China Trip → Participants → Deleted, where any can be restored,
          and {who.length === 1 ? "leaves" : "leave"} the lucky draw.
          {money > 0 && ` Their employees are not paid for them (${rupees(money)}).`}
        </p>
        <ul className="mt-3 divide-y divide-black/[0.06] rounded-xl text-[12.5px] ring-1 ring-black/[0.08]">
          {listed.map((a) => (
            <li key={a.id} className="flex justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate">
                <span className="font-mono text-[#0058b0]">{a.referenceNo}</span> {a.fullName}
              </span>
              <span className="shrink-0 text-[#6e6e73]">{a.employee ? a.employee.name : "No link"}</span>
            </li>
          ))}
          {who.length > listed.length && <li className="px-3 py-2 text-[#6e6e73]">and {who.length - listed.length} more</li>}
        </ul>
        <p className="mt-3 text-[12.5px] text-[#6e6e73]">Cards joined only by a name are left for you to check one by one.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancel} type="button" disabled={busy} onClick={onCancel} className={`${pill} h-9 bg-white px-4 hover:bg-black/[0.03]`}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-red-500 px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
          >
            <Trash2 size={14} aria-hidden="true" /> {busy ? "Deleting…" : `Delete ${who.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
