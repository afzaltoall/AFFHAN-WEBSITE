"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { NOT_STARTED, outcomeMeta, type LeadOutcomeKey } from "@/lib/leadStatus";
import { Avatar } from "@/components/admin/AssigneePicker";
import { OutcomeBar, STAFF_ORDER } from "@/components/ui/OutcomeVisuals";
import { LiveRefresh } from "@/components/ui/LiveRefresh";

const sfFont = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

export interface TeamRow {
  id: string;
  name: string;
  image: string | null;
  region: string | null;
  assigned: number;
  counts: Record<LeadOutcomeKey, number>;
  recorded: number;
  thisWeek: number;
  winRate: number | null;
}

interface Totals {
  staff: number;
  assigned: number;
  lead: number;
  noLead: number;
  open: number;
  recorded: number;
  thisWeek: number;
  lastWeek: number;
  winRate: number | null;
}

/** Every column somebody might want the list ordered by. */
type SortKey = "name" | "assigned" | "winRate" | LeadOutcomeKey;

/**
 * The team, one row each.
 *
 * Busiest first by default, because the first question is where the work is,
 * not who is at the top of the alphabet. Every column sorts, and the sort is
 * stable on name so two people with the same number never swap places between
 * renders.
 *
 * A row is a link to that person's own page: this screen says WHICH person to
 * look at, and theirs says what they have been doing.
 */
export function TeamPerformance({ rows, totals }: { rows: TeamRow[]; totals: Totals }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("assigned");
  const [asc, setAsc] = useState(false);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((r) => `${r.name} ${r.region ?? ""}`.toLowerCase().includes(needle))
      : rows;
    const value = (r: TeamRow): number | string =>
      sort === "name" ? r.name.toLowerCase()
        : sort === "assigned" ? r.assigned
        : sort === "winRate" ? (r.winRate ?? -1)
        : r.counts[sort] ?? 0;
    return [...filtered].sort((a, b) => {
      const av = value(a), bv = value(b);
      const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
      // Name breaks every tie, so the order never wobbles between renders.
      return (asc ? cmp : -cmp) || a.name.localeCompare(b.name);
    });
  }, [rows, q, sort, asc]);

  const head = (key: SortKey, label: string, align: "left" | "right" = "right") => {
    const on = sort === key;
    // aria-sort belongs to the column, not to the control inside it: a button
    // has no sort state, the header cell does.
    return (
      <th
        aria-sort={on ? (asc ? "ascending" : "descending") : "none"}
        className={`px-3 py-3 ${align === "right" ? "text-right" : "text-left"}`}
      >
        <button
          type="button"
          onClick={() => { if (on) setAsc(!asc); else { setSort(key); setAsc(false); } }}
          className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider transition-colors ${
            on ? "text-[#1d1d1f]" : "text-[#86868b] hover:text-[#1d1d1f]"
          }`}
        >
          {align === "right" && on && (asc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
          {label}
          {align === "left" && on && (asc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
        </button>
      </th>
    );
  };

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/admin/"
            aria-label="Back to the dashboard"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] lg:hidden"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Team performance</h1>
            <p className="text-[13px] text-[#86868b]">
              {totals.staff === 0
                ? "No active staff yet."
                : `${totals.staff} active ${totals.staff === 1 ? "person" : "people"} · each lead counted once, by its newest outcome`}
            </p>
          </div>
          <LiveRefresh intervalMs={60_000} />
        </div>

        {/* The glance before the detail: four figures, no chart. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Figure value={totals.lead} label="Leads won" hint="across everybody, all time" />
          <Figure
            value={totals.winRate === null ? "—" : `${totals.winRate}%`}
            label="Team win rate"
            hint={totals.lead + totals.noLead === 0 ? "nothing decided yet" : `${totals.lead} of ${totals.lead + totals.noLead} decided`}
          />
          <Figure value={totals.staff} label="Active staff" hint={`${totals.assigned} leads between them`} />
          <Figure
            value={totals.open}
            label="Still open"
            hint="in progress, passed on, or not started"
          />
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
          <div className="flex flex-col gap-3 border-b border-black/[0.06] p-4 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868b]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search a name…"
                aria-label="Search the team by name"
                className="h-10 w-full rounded-xl bg-[#f5f5f7] pl-9 pr-9 text-sm outline-none transition-shadow placeholder:text-[#86868b] focus:ring-2 focus:ring-brand/30"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  aria-label="Clear the search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#86868b] hover:bg-black/[0.05]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="text-[12px] text-[#86868b] sm:ml-auto">
              {shown.length === rows.length
                ? `${rows.length} ${rows.length === 1 ? "person" : "people"}`
                : `${shown.length} of ${rows.length}`}
              {" · click a row for their page"}
            </p>
          </div>

          {shown.length === 0 ? (
            <p className="px-5 py-12 text-center text-[13px] text-[#86868b]">
              {rows.length === 0
                ? "Nobody is active. Staff appear here once they have an account."
                : "Nobody matches that name."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-[13px]">
                <thead className="bg-[#f5f5f7]">
                  <tr>
                    {head("name", "Staff", "left")}
                    {head("assigned", "Assigned")}
                    <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
                      Where their leads stand
                    </th>
                    {STAFF_ORDER.map((key) => head(key, shortLabel(key)))}
                    {head("winRate", "Win rate")}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.04]">
                  {shown.map((r) => (
                    <tr key={r.id} className="group relative transition-colors hover:bg-black/[0.015]">
                      <td className="px-3 py-3">
                        <Link
                          href={`/admin/employees/${r.id}/`}
                          className="flex items-center gap-2.5 after:absolute after:inset-0 after:content-['']"
                        >
                          <Avatar name={r.name} image={r.image} size={28} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold group-hover:underline">{r.name}</span>
                            {r.region && <span className="block text-[11.5px] text-[#86868b]">{r.region}</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{r.assigned}</td>
                      <td className="px-3 py-3">
                        <OutcomeBar counts={r.counts} total={r.assigned} order={STAFF_ORDER} height="h-2.5" className="min-w-[7rem]" />
                      </td>
                      {STAFF_ORDER.map((key) => (
                        <td key={key} className="px-3 py-3 text-right tabular-nums">
                          <span className={(r.counts[key] ?? 0) === 0 ? "text-[#c7c7cc]" : ""}>{r.counts[key] ?? 0}</span>
                        </td>
                      ))}
                      {/* The rate never stands on its own here. One decided
                          lead won is a hundred per cent, and sorted by rate it
                          outranks somebody with twenty — which is true and
                          useless. The denominator underneath is what stops
                          that number meaning more than it does. */}
                      <td className="px-3 py-3 text-right tabular-nums">
                        {r.winRate === null ? (
                          <span className="text-[#c7c7cc]">—</span>
                        ) : (
                          <>
                            <span className="font-semibold">{r.winRate}%</span>
                            <span className="block text-[11px] text-[#86868b]">
                              of {r.counts.LEAD + r.counts.NO_LEAD} decided
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* The bar's key, once, under the table it belongs to. */}
        <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[12px] text-[#48484a]">
          {STAFF_ORDER.map((key) => (
            <li key={key} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${outcomeMeta(key).dot}`} />
              {outcomeMeta(key).label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Short enough for a column head; the legend below spells them out. */
function shortLabel(key: LeadOutcomeKey): string {
  switch (key) {
    case "LEAD": return "Lead";
    case "NO_LEAD": return "No lead";
    case "NOT_ATTENDED": return "Passed on";
    case "IN_PROGRESS": return "Working";
    case NOT_STARTED: return "Untouched";
    default: return outcomeMeta(key).label;
  }
}

function Figure({ value, label, hint }: { value: number | string; label: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.04] sm:p-5">
      <p className="text-2xl font-semibold tabular-nums tracking-tight sm:text-[28px]">
        {typeof value === "number" ? value.toLocaleString("en-GB") : value}
      </p>
      <p className="mt-1 text-[12.5px] font-medium text-[#48484a]">{label}</p>
      <p className="mt-0.5 text-[11.5px] text-[#86868b]">{hint}</p>
    </div>
  );
}

export default TeamPerformance;
