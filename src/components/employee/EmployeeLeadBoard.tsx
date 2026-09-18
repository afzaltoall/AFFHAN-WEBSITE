"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Building2, Check, ChevronRight, Mail, MapPin, MessageSquare, Phone, Search, SlidersHorizontal, Users, X,
} from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { timeAgo } from "@/lib/relative-time";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { OUTCOME_ORDER, outcomeMeta, outcomeOf, type LeadOutcomeKey } from "@/lib/leadStatus";
import { LiveRefreshButton } from "@/components/ui/LiveRefreshButton";
import { LeadDetail } from "@/components/employee/LeadDetail";
import { leadKey, type LeadCardData, type LeadUpdate } from "@/components/employee/lead-types";
import { wt } from "@/components/employee/workspace-ui";

/**
 * A member of staff's leads, laid out the way the console lays out the same
 * rows — because the admin assigns from there, and what they hand over should
 * look like what they handed over.
 *
 *   - Tiles across the top: how much is assigned, and where each outcome
 *     stands. Each one is also the filter for itself.
 *   - One list in a card: search, Quote requests / Contact messages, and the
 *     outcome filter above it; rows with the product's photograph, the
 *     customer, and the outcome so far.
 *   - A row opens the lead in full (LeadDetail), where the outcome is recorded.
 *
 * The page keeps itself current (useLiveRefresh): a lead assigned from /admin
 * appears here within half a minute without anybody reloading. Filtering is
 * client-side on purpose — the page already holds this person's whole list,
 * which is small by construction, so narrowing it should not cost a round trip.
 */

type OutcomeFilter = "all" | LeadOutcomeKey;
type KindFilter = "all" | "inquiry" | "contact";

/** Where a lead stands: its newest update's outcome, or not started. */
const outcomeFor = (lead: LeadCardData) => outcomeOf(lead.updates[0]?.status);

export function EmployeeLeadBoard({ leads, name }: { leads: LeadCardData[]; name: string | null }) {
  const { refresh, refreshing, updatedAt } = useLiveRefresh(30_000);
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  /**
   * Outcomes recorded here that the server's copy of the page may not have
   * yet. Merged by id, so once the refresh brings them back they are simply
   * the server's rows again.
   */
  const [pending, setPending] = useState<Map<string, LeadUpdate[]>>(() => new Map());

  const merged = useMemo(
    () =>
      leads.map((lead) => {
        const extra = pending.get(leadKey(lead));
        if (!extra?.length) return lead;
        const known = new Set(lead.updates.map((u) => u.id));
        const updates = [...extra.filter((u) => !known.has(u.id)), ...lead.updates].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        return { ...lead, updates };
      }),
    [leads, pending]
  );


  // The tiles describe the whole of this person's work, so they do not move
  // while somebody types.
  const totals = useMemo(() => {
    const m = new Map<LeadOutcomeKey, number>();
    for (const lead of merged) m.set(outcomeFor(lead), (m.get(outcomeFor(lead)) ?? 0) + 1);
    return m;
  }, [merged]);

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return merged.filter(
      (l) =>
        (kind === "all" || l.kind === kind) &&
        (!needle ||
          `${l.customerName} ${l.companyName ?? ""} ${l.title} ${l.country} ${l.email ?? ""} ${l.phone} ${l.message ?? ""}`
            .toLowerCase()
            .includes(needle))
    );
  }, [merged, q, kind]);

  // The filter panel's counts follow the search and the tab, so a number on a
  // row is what choosing it would actually show.
  const filterCounts = useMemo(() => {
    const m = new Map<LeadOutcomeKey, number>();
    for (const lead of searched) m.set(outcomeFor(lead), (m.get(outcomeFor(lead)) ?? 0) + 1);
    return m;
  }, [searched]);

  const shown = useMemo(
    () => (outcome === "all" ? searched : searched.filter((l) => outcomeFor(l) === outcome)),
    [searched, outcome]
  );

  const inquiryCount = merged.filter((l) => l.kind === "inquiry").length;
  const contactCount = merged.length - inquiryCount;
  const open = openKey ? merged.find((l) => leadKey(l) === openKey) ?? null : null;
  const filtering = q.trim() !== "" || outcome !== "all" || kind !== "all";
  const clear = () => { setQ(""); setOutcome("all"); setKind("all"); };

  const recorded = (lead: LeadCardData, update: LeadUpdate) => {
    setPending((cur) => {
      const next = new Map(cur);
      next.set(leadKey(lead), [update, ...(next.get(leadKey(lead)) ?? [])]);
      return next;
    });
    // The console reads the same rows; bring this page's server copy up too.
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My leads</h1>
          <p className={`mt-0.5 text-[13px] ${wt.soft}`}>
            {name ? `Welcome back, ${name}.` : "Welcome back."}{" "}
            {merged.length === 0
              ? "Nothing is assigned to you yet — new leads appear here as soon as they are handed over."
              : `${merged.length} ${merged.length === 1 ? "lead is" : "leads are"} assigned to you.`}
          </p>
        </div>
        <LiveRefreshButton onRefresh={refresh} refreshing={refreshing} updatedAt={updatedAt} />
      </div>

      {/* KPI row: stat tiles, not a chart — each is one number, and each is
          the filter for itself. Identity is the label; the dot beside it is
          the colour the same outcome wears everywhere else. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Assigned to you" value={merged.length} on={outcome === "all"} onClick={() => setOutcome("all")} />
        {OUTCOME_ORDER.map((key) => (
          <Tile
            key={key}
            label={outcomeMeta(key).label}
            dot={outcomeMeta(key).dot}
            value={totals.get(key) ?? 0}
            on={outcome === key}
            onClick={() => setOutcome(outcome === key ? "all" : key)}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
        <div className={`flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center ${wt.border}`}>
          <div className="relative flex-1 lg:max-w-sm">
            <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${wt.soft}`} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, company, product…"
              aria-label="Search your leads"
              className={`h-10 w-full rounded-xl pl-9 pr-9 text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand/30 ${wt.input}`}
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

          <div className="flex flex-wrap items-center gap-2">
            {([
              ["all", "All", merged.length],
              ["inquiry", "Quote requests", inquiryCount],
              ["contact", "Contact messages", contactCount],
            ] as const).map(([value, label, n]) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                aria-pressed={kind === value}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  kind === value ? "bg-[#1d1d1f] text-white" : "bg-white text-[#1d1d1f] ring-1 ring-black/[0.06] hover:bg-black/[0.02]"
                }`}
              >
                {label}
                <span className={`text-[11px] font-bold ${kind === value ? "text-white/70" : wt.soft}`}>{n}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 lg:ml-auto">
            {filtering && (
              <button type="button" onClick={clear} className={`rounded-xl px-3 py-2 text-[13px] font-semibold ${wt.soft} hover:bg-black/[0.03]`}>
                Clear
              </button>
            )}
            <OutcomeMenu value={outcome} onChange={setOutcome} counts={filterCounts} total={searched.length} />
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <p className="text-[15px] font-semibold">{merged.length === 0 ? "Nothing assigned yet" : "Nothing matches"}</p>
            <p className={`mt-1 text-[13px] ${wt.soft}`}>
              {merged.length === 0
                ? "When a lead is assigned to you from the console it appears here — this page checks every half minute."
                : "No lead of yours matches that. Try a different search or outcome."}
            </p>
            {filtering && (
              <button type="button" onClick={clear} className={`mt-3 inline-flex items-center rounded-full px-4 py-2 text-[13px] font-semibold shadow-sm ${wt.pill}`}>
                Clear the filters
              </button>
            )}
          </div>
        ) : (
          <ul className={`divide-y ${wt.divide}`}>
            {shown.map((lead) => (
              <LeadRow key={leadKey(lead)} lead={lead} outcome={outcomeFor(lead)} onOpen={() => setOpenKey(leadKey(lead))} />
            ))}
          </ul>
        )}
      </div>

      {open && (
        <LeadDetail
          lead={open}
          onClose={() => setOpenKey(null)}
          onRecorded={(update) => recorded(open, update)}
        />
      )}
    </div>
  );
}

function Tile({
  label, value, dot, on, onClick,
}: {
  label: string; value: number; dot?: string; on: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-2xl bg-white p-4 text-left shadow-sm ring-1 transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${
        on ? "ring-2 ring-brand/50" : "ring-black/[0.04]"
      }`}
    >
      <p className="text-2xl font-semibold tracking-tight sm:text-[28px]">{value.toLocaleString("en-GB")}</p>
      <p className={`mt-1 flex items-center gap-1.5 text-[12.5px] font-medium ${wt.mid}`}>
        {dot && <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />}
        {label}
      </p>
    </button>
  );
}

function LeadRow({ lead, outcome, onOpen }: { lead: LeadCardData; outcome: LeadOutcomeKey; onOpen: () => void }) {
  const thumb = lead.kind === "inquiry" ? getCdnUrl(lead.image, 160) : null;
  const meta = outcomeMeta(outcome);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-black/[0.02] sm:flex-row sm:items-center"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {lead.kind === "inquiry" ? (
            thumb ? (
              <span className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl ${wt.thumb}`}>
                <Image src={thumb as string} alt={lead.title} fill sizes="64px" className="object-cover" />
              </span>
            ) : (
              <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-[10px] font-semibold ${wt.thumb} ${wt.soft}`}>
                No image
              </span>
            )
          ) : (
            <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl ${wt.thumb} ${wt.soft}`}>
              <MessageSquare className="h-6 w-6" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[14px] font-semibold leading-snug sm:text-[13.5px]">{lead.title}</p>
            {lead.kind === "contact" && lead.message && (
              <p className={`mt-0.5 line-clamp-1 text-[12.5px] ${wt.mid}`}>{lead.message}</p>
            )}
            <div className={`mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] ${wt.mid}`}>
              {lead.kind === "inquiry" && (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                  <Users className={`h-3 w-3 shrink-0 ${wt.soft}`} />
                  <span className="truncate font-semibold">{lead.customerName}</span>
                </span>
              )}
              {lead.companyName && (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                  <Building2 className={`h-3 w-3 shrink-0 ${wt.soft}`} />
                  <span className="truncate">{lead.companyName}</span>
                </span>
              )}
              {lead.country && (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                  <MapPin className={`h-3 w-3 shrink-0 ${wt.soft}`} />
                  <span className="truncate">{lead.country}</span>
                </span>
              )}
              {lead.phone && (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                  <Phone className={`h-3 w-3 shrink-0 ${wt.soft}`} />
                  <span className="truncate tabular-nums">{lead.phone}</span>
                </span>
              )}
              {lead.email && (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                  <Mail className={`h-3 w-3 shrink-0 ${wt.soft}`} />
                  <span className="truncate">{lead.email}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5 pl-[76px] sm:pl-0">
          {lead.quantity !== null && (
            <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand-dark">Qty {lead.quantity}</span>
          )}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          <span className={`w-20 text-right text-[12px] ${wt.soft}`} title={new Date(lead.createdAt).toLocaleString("en-GB")}>
            {timeAgo(lead.createdAt)}
          </span>
          <ChevronRight className={`hidden h-4 w-4 sm:block ${wt.soft}`} />
        </div>
      </button>
    </li>
  );
}

/**
 * The outcome filter: the console's Filter button and panel, scoped to one
 * question. Short by construction — six rows — so it never runs the height of
 * the window the way the console's once did.
 */
function OutcomeMenu({
  value, onChange, counts, total,
}: {
  value: OutcomeFilter; onChange: (v: OutcomeFilter) => void; counts: Map<LeadOutcomeKey, number>; total: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const rows: OutcomeFilter[] = ["all", ...OUTCOME_ORDER];
  const label = (o: OutcomeFilter) => (o === "all" ? "All outcomes" : outcomeMeta(o).label);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold shadow-sm ${wt.pill}`}
      >
        <SlidersHorizontal size={15} />
        {value === "all" ? "Filter" : label(value)}
        {value !== "all" && <span className={`h-1.5 w-1.5 rounded-full ${outcomeMeta(value).dot}`} />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-60 rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-black/[0.06]">
          <p className={`px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider ${wt.soft}`}>Outcome</p>
          {rows.map((row) => {
            const on = value === row;
            const n = row === "all" ? total : counts.get(row) ?? 0;
            return (
              <button
                key={row}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => { onChange(row); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${
                  on ? "bg-brand/10 text-brand-dark" : `${wt.hover} ${wt.mid}`
                }`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${row === "all" ? "bg-[#c7c7cc]" : outcomeMeta(row).dot}`} />
                <span className="flex-1 truncate">{label(row)}</span>
                <span className={`shrink-0 text-[11px] font-bold ${on ? "text-brand-dark" : wt.soft}`}>{n}</span>
                {on && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default EmployeeLeadBoard;
