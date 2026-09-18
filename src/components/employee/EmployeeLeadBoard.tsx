"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Package, Search, SlidersHorizontal, X } from "lucide-react";
import { EmployeeLeadCard, type LeadCardData } from "@/components/employee/EmployeeLeadCard";
import { LEAD_STATUSES, LEAD_STATUS_META, leadStatusChip } from "@/lib/leadStatus";
import { wt } from "@/components/employee/workspace-ui";

/**
 * A member of staff's own leads, with the two controls that make a list of
 * fifty usable: a search box and the outcome filter.
 *
 * Both are the console's, in shape and in wording — a search field on the left,
 * a Filter button that opens a panel of rows with counts on the right, the
 * active choice named on the button itself. Somebody who has been shown /admin
 * already knows how to drive this.
 *
 * The vocabulary is the one in lib/leadStatus, plus "Not started" for a lead
 * nobody has written against yet. That is not a status anybody records — there
 * is no NONE row in the table — so it is computed here, which is also why it
 * cannot be filtered server-side without inventing one.
 *
 * Filtering is client-side on purpose: the page already holds every lead this
 * person has, the set is small by construction (it is one person's work), and
 * narrowing it should not cost a round trip.
 */

/** "all", "NONE" for nothing recorded yet, or one of the recorded outcomes. */
type OutcomeFilter = "all" | "NONE" | (typeof LEAD_STATUSES)[number];

const NOT_STARTED = { label: "Not started", hint: "Nobody has recorded anything yet", dot: "bg-[#c7c7cc]" };

const outcomeOf = (lead: LeadCardData): OutcomeFilter => {
  const latest = lead.updates[0];
  return latest ? ((latest.status as OutcomeFilter) ?? "NONE") : "NONE";
};

const labelFor = (o: OutcomeFilter) =>
  o === "all" ? "All outcomes" : o === "NONE" ? NOT_STARTED.label : LEAD_STATUS_META[o].label;

const dotFor = (o: OutcomeFilter) => (o === "NONE" ? NOT_STARTED.dot : o === "all" ? "bg-[#c7c7cc]" : LEAD_STATUS_META[o].dot);

const chipFor = (o: OutcomeFilter) => (o === "NONE" || o === "all" ? wt.chip : leadStatusChip(o));

export function EmployeeLeadBoard({ leads, firstName }: { leads: LeadCardData[]; firstName: string | null }) {
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Click-away and Escape, so the panel behaves like the console's.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return leads;
    return leads.filter((l) =>
      `${l.customerName} ${l.companyName ?? ""} ${l.title} ${l.country} ${l.email ?? ""} ${l.phone}`
        .toLowerCase()
        .includes(needle)
    );
  }, [leads, q]);

  // Counts follow the search, so a number on a filter row is what clicking it
  // would actually show rather than what it would show on a cleared search.
  const counts = useMemo(() => {
    const map = new Map<OutcomeFilter, number>();
    for (const lead of searched) {
      const o = outcomeOf(lead);
      map.set(o, (map.get(o) ?? 0) + 1);
    }
    return map;
  }, [searched]);

  const shown = useMemo(
    () => (outcome === "all" ? searched : searched.filter((l) => outcomeOf(l) === outcome)),
    [searched, outcome]
  );

  const inquiries = shown.filter((l) => l.kind === "inquiry");
  const contacts = shown.filter((l) => l.kind === "contact");
  const filtering = outcome !== "all" || q.trim() !== "";
  const rows: OutcomeFilter[] = ["all", "NONE", ...LEAD_STATUSES];

  const clear = () => { setQ(""); setOutcome("all"); };

  const inputClass = `h-10 w-full rounded-xl pl-9 pr-9 text-[13px] outline-none ring-1 ring-transparent transition-shadow focus:ring-2 focus:ring-brand/30 ${wt.input}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {firstName ? `Welcome, ${firstName}` : "Your leads"}
          </h1>
          <p className={`mt-0.5 text-[13px] ${wt.soft}`}>
            {leads.length === 0
              ? "Nothing is assigned to you yet. Leads appear here as soon as an administrator hands one over."
              : filtering
                ? `${shown.length} of ${leads.length} ${leads.length === 1 ? "lead" : "leads"} shown.`
                : `${leads.length} ${leads.length === 1 ? "lead is" : "leads are"} assigned to you.`}
          </p>
        </div>

        {leads.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${wt.soft}`} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, company, product…"
                aria-label="Search your leads"
                className={inputClass}
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  aria-label="Clear search"
                  className={`absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 ${wt.soft} hover:bg-black/[0.05]`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                className={`inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold shadow-sm transition-colors ${wt.pill}`}
              >
                <SlidersHorizontal size={15} />
                {outcome === "all" ? "Filter" : labelFor(outcome)}
                {outcome !== "all" && <span className={`h-1.5 w-1.5 rounded-full ${dotFor(outcome)}`} />}
              </button>

              {open && (
                <div
                  role="menu"
                  className={`absolute right-0 z-20 mt-2 w-60 rounded-2xl p-1.5 shadow-xl ring-1 ring-black/[0.06] ${wt.card}`}
                >
                  <p className={`px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider ${wt.soft}`}>
                    Outcome
                  </p>
                  {rows.map((row) => {
                    const on = outcome === row;
                    const n = row === "all" ? searched.length : counts.get(row) ?? 0;
                    return (
                      <button
                        key={row}
                        role="menuitemradio"
                        aria-checked={on}
                        onClick={() => { setOutcome(row); setOpen(false); }}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${
                          on ? "bg-brand/10 text-brand-dark" : `${wt.hover} ${wt.mid}`
                        }`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${dotFor(row)}`} />
                        <span className="flex-1 truncate">{labelFor(row)}</span>
                        <span className={`shrink-0 text-[11px] font-bold tabular-nums ${on ? "text-brand-dark" : wt.soft}`}>
                          {n}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {filtering && (
              <button
                type="button"
                onClick={clear}
                className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold ${wt.soft} hover:bg-black/[0.03]`}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* The same six rows as the filter panel, laid flat: at a glance it is
          where this person's work stands, and each one is the filter. */}
      {leads.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rows
            .filter((row) => row === "all" || (counts.get(row) ?? 0) > 0)
            .map((row) => {
              const on = outcome === row;
              const n = row === "all" ? searched.length : counts.get(row) ?? 0;
              return (
                <button
                  key={row}
                  type="button"
                  onClick={() => setOutcome(row)}
                  aria-pressed={on}
                  className={`rounded-md px-2 py-1 text-[11px] font-bold transition-all ${chipFor(row)} ${
                    on ? "ring-2 ring-brand/40" : "opacity-80 hover:opacity-100"
                  }`}
                >
                  {labelFor(row)} · {n}
                </button>
              );
            })}
        </div>
      )}

      {leads.length > 0 && shown.length === 0 && (
        <div className={`rounded-2xl px-4 py-10 text-center ${wt.card}`}>
          <p className="text-[15px] font-semibold">Nothing matches</p>
          <p className={`mt-1 text-[13px] ${wt.soft}`}>
            No lead of yours matches {q.trim() ? `“${q.trim()}”` : "that outcome"}
            {q.trim() && outcome !== "all" ? ` with the outcome “${labelFor(outcome)}”` : ""}.
          </p>
          <button
            type="button"
            onClick={clear}
            className={`mt-3 inline-flex items-center rounded-full px-4 py-2 text-[13px] font-semibold shadow-sm ${wt.pill}`}
          >
            Clear the filters
          </button>
        </div>
      )}

      <Section
        title="Quote requests"
        icon={<Package size={15} className={wt.soft} />}
        empty="No quote requests match."
        leads={inquiries}
        hide={shown.length === 0}
      />
      <Section
        title="Contact messages"
        icon={<MessageSquare size={15} className={wt.soft} />}
        empty="No contact messages match."
        leads={contacts}
        hide={shown.length === 0}
      />
    </div>
  );
}

function Section({
  title,
  icon,
  empty,
  leads,
  hide,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  leads: LeadCardData[];
  hide: boolean;
}) {
  // While a filter is showing nothing at all, the two "none of these either"
  // panels say the same thing a third time. One message is enough.
  if (hide) return null;

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${wt.chip}`}>
          {leads.length}
        </span>
      </div>
      {leads.length === 0 ? (
        <p className={`rounded-2xl px-4 py-6 text-center text-[13px] ${wt.card} ${wt.soft}`}>{empty}</p>
      ) : (
        // Two columns once there is room for them. One card stretched across a
        // 1300px desk is mostly empty card; at this width the point of the
        // space is to show more of the work at once, not a wider single row.
        <ul className="grid items-start gap-3 xl:grid-cols-2">
          {leads.map((lead) => (
            <EmployeeLeadCard key={`${lead.kind}:${lead.id}`} lead={lead} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default EmployeeLeadBoard;
