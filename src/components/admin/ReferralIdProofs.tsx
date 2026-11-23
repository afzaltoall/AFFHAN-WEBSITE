"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { TripDocuments } from "@/components/admin/TripApplicationsBoard";
import { IdProofLockLine } from "@/components/admin/IdProofLock";
import { EmployeePicker, type EmployeeChoice } from "@/components/admin/EmployeePicker";
import type { IdProofApplication, IdProofsView } from "@/lib/server/trip-id-proofs";
import { ID_PROOFS, ID_PROOF_SMALL_BYTES, referralStateLabel, type IdProof } from "@/lib/trip-referral-shared";

/**
 * Employee tasks → ID proofs (the owner, 2026-11-23: "some of them applied wrong document like some other images so
 * check that too and insert a filter option to check"): every application through an employee's link with the ID proof
 * it sent, large, newest first, to look at and mark Wrong document: it is then never counted, with who said so and
 * when, and Count undoes it. Whether a picture is an ID, and this applicant's, only a person can tell (nothing reads the
 * pictures), so the filters bring the likeliest first: an employee, with how many each has (the most first), the ID it
 * was added as (Other ID), and Small file (under 30 KB, rarely a readable ID). Behind the admin's password as everywhere.
 */

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const pill = "inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium ring-1 ring-black/[0.08] transition-colors disabled:opacity-50";
/** How many cards are drawn at first, and added each time the end of the list comes into view. */
const PAGE = 48;

type State = "counting" | "wrong" | "all";
/** An ID the file was added as, a file from before the seven (no name), or a small file. */
type Kind = "any" | IdProof | "unnamed" | "small";
type Decide = (ids: string[], state: "counted" | "wrong_document") => Promise<boolean>;

const isSmall = (a: IdProofApplication) => a.documents.some((d) => d.size != null && d.size < ID_PROOF_SMALL_BYTES);
const kindsOf = (a: IdProofApplication): Kind[] => [...new Set(a.documents.map((d) => (d.proof ?? "unnamed") as Kind)), ...(isSmall(a) ? (["small"] as const) : [])];
const inState = (a: IdProofApplication, s: State) => (s === "all" ? true : s === "wrong" ? a.referralState === "wrong_document" : a.referralState === "counted");
const kb = (bytes: number) => (bytes < 1024 ? `${bytes} bytes` : `${Math.round(bytes / 1024)} KB`);

/** A mark shown at once, while the list is read again. */
export function markedLocally(data: IdProofsView, ids: readonly string[], state: "counted" | "wrong_document"): IdProofsView {
  const marked = new Set(ids);
  const now = new Date().toISOString();
  return {
    ...data,
    applications: data.applications.map((a) => (marked.has(a.id) && !a.paid ? { ...a, referralState: state, decidedAt: now, decidedBy: null } : a)),
  };
}

export function ReferralIdProofs({
  data,
  failed,
  reading,
  busy,
  employee,
  onEmployee,
  onBack,
  onDuplicates,
  onRetry,
  onDecide,
}: {
  data: IdProofsView | null;
  failed: boolean;
  reading: boolean;
  busy: boolean;
  employee: string | null;
  onEmployee: (id: string | null) => void;
  onBack: () => void;
  onDuplicates: () => void;
  onRetry: () => void;
  onDecide: Decide;
}) {
  const [state, setState] = useState<State>("counting");
  const [kind, setKind] = useState<Kind>("any");
  const [q, setQ] = useState("");
  const [shownCount, setShownCount] = useState(PAGE);
  const needle = q.trim().toLowerCase();
  const apps = useMemo(() => data?.applications ?? [], [data]);

  // Each filter narrows what the next one counts: the state, then the employee, then the kind of file.
  const inTab = useMemo(() => apps.filter((a) => inState(a, state)), [apps, state]);
  const choices = useMemo<EmployeeChoice[]>(() => {
    const counts = new Map<string, number>();
    for (const a of inTab) counts.set(a.employeeId, (counts.get(a.employeeId) ?? 0) + 1);
    return Object.entries(data?.employees ?? {})
      .map(([id, e]) => ({ id, name: e.name, count: counts.get(id) ?? 0 }))
      .filter((c) => c.count > 0 || c.id === employee)
      .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
  }, [data, inTab, employee]);
  const theirs = useMemo(() => (employee ? inTab.filter((a) => a.employeeId === employee) : inTab), [inTab, employee]);
  const kinds = useMemo(() => {
    const counts = new Map<Kind, number>();
    for (const a of theirs) for (const k of kindsOf(a)) counts.set(k, (counts.get(k) ?? 0) + 1);
    const list: [Kind, string, number][] = [["any", "Every ID", theirs.length]];
    for (const p of ID_PROOFS) if (counts.get(p.id)) list.push([p.id, p.label, counts.get(p.id)!]);
    if (counts.get("unnamed")) list.push(["unnamed", "Not named", counts.get("unnamed")!]);
    list.push(["small", "Small file", counts.get("small") ?? 0]);
    return list;
  }, [theirs]);
  const shown = useMemo(
    () =>
      theirs
        .filter((a) => kind === "any" || kindsOf(a).includes(kind))
        .filter((a) => !needle || [a.fullName, a.referenceNo, a.city, a.country, data?.employees[a.employeeId]?.name ?? ""].join(" ").toLowerCase().includes(needle)),
    [theirs, kind, needle, data],
  );
  const counts = { counting: apps.filter((a) => inState(a, "counting")).length, wrong: apps.filter((a) => inState(a, "wrong")).length, all: apps.length };

  // A new filter starts at the top of its list; the rest come as the end of the list comes into view.
  useEffect(() => setShownCount(PAGE), [state, kind, employee, needle]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = end.current;
    if (!el || shownCount >= shown.length) return;
    const watch = new IntersectionObserver((seen) => {
      if (seen.some((s) => s.isIntersecting)) setShownCount((n) => n + PAGE);
    }, { rootMargin: "600px" });
    watch.observe(el);
    return () => watch.disconnect();
  }, [shownCount, shown.length]);

  return (
    <section aria-labelledby="id-proofs-title" className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.06]">
      <div className="flex flex-wrap items-center gap-3 border-b border-black/[0.06] px-5 py-2.5">
        <button type="button" onClick={onBack} aria-label="Back to employees" className="-ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05]">
          <ArrowLeft size={16} />
        </button>
        <h2 id="id-proofs-title" className="text-[15px] font-semibold">
          ID proofs
        </h2>
        {data && <EmployeePicker choices={choices} value={employee} onChange={onEmployee} everyone={inTab.length} label={state === "wrong" ? "wrong documents" : "applications"} />}
        {apps.length > 0 && (
          <label className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <span className="sr-only">Search ID proofs</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && q) setQ("");
              }}
              placeholder="Search name, Trip ID or city"
              className="h-8 w-full rounded-full bg-white pl-9 pr-4 text-[13px] outline-none ring-1 ring-black/[0.08] focus:ring-2 focus:ring-[#0071e3]/40"
            />
          </label>
        )}
        <span className="ml-auto flex items-center gap-3">
          {reading && data && (
            <span className="text-[12px] text-[#86868b]" aria-live="polite">
              Reading again…
            </span>
          )}
          <button type="button" onClick={onDuplicates} className="text-[13px] font-medium text-[#0058b0] hover:underline">
            Duplicates
          </button>
        </span>
      </div>

      {!data ? (
        failed ? (
          <div role="alert" className="px-5 py-10 text-center text-[13px] text-[#48484a]">
            The ID proofs could not be read just now.{" "}
            <button type="button" onClick={onRetry} className="font-medium text-[#0058b0] hover:underline">
              Try again
            </button>
          </div>
        ) : (
          <div className="grid animate-pulse grid-cols-1 gap-3 px-5 py-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Reading the ID proofs">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl px-4 py-4 ring-1 ring-black/[0.06]">
                <span className="block h-28 w-44 rounded bg-black/[0.07]" />
                <span className="mt-3 block h-[14px] w-2/3 rounded bg-black/[0.07]" />
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.06] px-5 py-2.5">
            {(
              [
                ["counting", "Counted", counts.counting],
                ["wrong", "Wrong document", counts.wrong],
                ["all", "All", counts.all],
              ] as const
            ).map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                onClick={() => setState(id)}
                aria-pressed={state === id}
                className={`${pill} ${state === id ? "bg-[#1d1d1f] text-white ring-transparent" : "bg-white hover:bg-black/[0.03]"}`}
              >
                {label} <span className={`tabular-nums ${state === id ? "text-white/70" : "text-[#86868b]"}`}>{n}</span>
              </button>
            ))}
            <p className="ml-auto text-[13px] text-[#48484a]" aria-live="polite">
              <span className="font-semibold tabular-nums">{shown.length}</span> {shown.length === 1 ? "application" : "applications"} shown
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 border-b border-black/[0.06] px-5 py-2.5" role="group" aria-label="ID">
            {kinds.map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                onClick={() => setKind(id)}
                aria-pressed={kind === id}
                className={`inline-flex h-7 items-center gap-1 rounded-full px-3 text-[12px] font-medium ring-1 transition-colors ${
                  kind === id ? "bg-[#0058b0]/10 text-[#0058b0] ring-[#0058b0]/30" : "bg-white text-[#48484a] ring-black/[0.08] hover:bg-black/[0.03]"
                }`}
              >
                {label} <span className="tabular-nums text-[#86868b]">{n}</span>
              </button>
            ))}
          </div>
          {shown.length > 0 && <IdProofLockLine className="border-b border-black/[0.06] px-5 py-2" />}
          {shown.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-[#86868b]">
              {needle ? (
                <>
                  Nothing matches “{q.trim()}”.{" "}
                  <button type="button" onClick={() => setQ("")} className="font-medium text-[#0058b0] hover:underline">
                    Clear search
                  </button>
                </>
              ) : state === "wrong" ? (
                "No wrong document marked."
              ) : (
                "Nothing here."
              )}
            </p>
          ) : (
            <>
              <ol className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {shown.slice(0, shownCount).map((a) => (
                  <Card key={a.id} a={a} employee={data.employees[a.employeeId]} busy={busy} onDecide={onDecide} />
                ))}
              </ol>
              {shownCount < shown.length && (
                <div ref={end} className="px-5 pb-5 text-center text-[12.5px] text-[#86868b]">
                  Showing {shownCount} of {shown.length}…
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

/** One application: its ID proof large, who it is (to read against the ID), whose link, and the mark. */
function Card({ a, employee, busy, onDecide }: { a: IdProofApplication; employee?: { name: string; code: string | null }; busy: boolean; onDecide: Decide }) {
  const small = a.documents.filter((d) => d.size != null && d.size < ID_PROOF_SMALL_BYTES);
  const wrong = a.referralState === "wrong_document";
  const who = a.decidedBy ? `${a.decidedBy}${a.decidedAt ? `, ${fmtWhen(a.decidedAt)}` : ""}` : null;
  return (
    <li className={`flex flex-col rounded-xl p-3.5 ring-1 ${wrong ? "ring-red-500/30" : "ring-black/[0.08]"}`} aria-label={`${a.fullName}, ${a.referenceNo}`}>
      {a.documents.length ? <TripDocuments documents={a.documents} large withLockLine={false} /> : <p className="text-[12.5px] text-[#86868b]">No ID proof</p>}
      <p className="mt-2.5 text-[14px] font-semibold">
        {a.fullName}
        <span className="ml-2 font-mono text-[12px] font-normal text-[#0058b0]">{a.referenceNo}</span>
      </p>
      <p className="mt-0.5 text-[12.5px] text-[#48484a]">
        {[a.city, a.country].filter(Boolean).join(", ")} · {fmtDay(a.createdAt)}
      </p>
      <p className="mt-0.5 text-[12.5px] text-[#6e6e73]">
        {employee ? (
          <>
            Through {employee.name}&apos;s link{employee.code && <span className="font-mono"> {employee.code}</span>}
          </>
        ) : (
          "Through a former employee's link"
        )}
      </p>
      {small.length > 0 && <p className="mt-0.5 text-[12.5px] font-medium text-amber-800">Small file: {small.map((d) => kb(d.size!)).join(", ")}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-[12.5px]">
        {a.paid ? (
          <span className="font-medium text-emerald-700">Paid</span>
        ) : wrong ? (
          <>
            <span className="font-semibold text-red-700">Wrong document</span>
            <button type="button" disabled={busy} onClick={() => void onDecide([a.id], "counted")} className="text-[12px] font-medium text-[#0058b0] hover:underline disabled:opacity-50">
              Count
            </button>
          </>
        ) : a.referralState === "counted" ? (
          <>
            <span className="text-emerald-700">Counted</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDecide([a.id], "wrong_document")}
              className={`${pill} ml-auto bg-white text-red-700 ring-red-500/25 hover:bg-red-500/10`}
            >
              Wrong document
            </button>
          </>
        ) : (
          <>
            <span className="text-[#6e6e73]">{referralStateLabel(a.referralState)}</span>
            <button type="button" disabled={busy} onClick={() => void onDecide([a.id], "wrong_document")} className="ml-auto text-[12px] font-medium text-[#0058b0] hover:underline disabled:opacity-50">
              Mark wrong document
            </button>
          </>
        )}
      </div>
      {who && (wrong || a.referralState !== "counted") && <p className="mt-1 text-[11.5px] text-[#86868b]">{who}</p>}
    </li>
  );
}
