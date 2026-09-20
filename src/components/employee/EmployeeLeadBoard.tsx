"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Building2, Check, ChevronRight, Mail, MapPin, MessageSquare, Phone, Search, SlidersHorizontal, Users, X,
} from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { timeAgo } from "@/lib/relative-time";
import { formatDateTime } from "@/lib/datetime";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { LEAD_STATUS_META, STAFF_OUTCOME_ORDER, outcomeMeta, outcomeOf, type LeadOutcomeKey, type LeadStatus } from "@/lib/leadStatus";
import { LiveRefreshButton } from "@/components/ui/LiveRefreshButton";
import { CustomerDetail, type RecordedUpdate } from "@/components/employee/CustomerDetail";
import { WorkspaceToast, type ToastMessage } from "@/components/employee/WorkspaceToast";
import { groupHaystack, groupLeads, type CustomerLeadGroup } from "@/components/employee/lead-groups";
import { leadKey, type LeadCardData, type LeadUpdate } from "@/components/employee/lead-types";
import { wt } from "@/components/employee/workspace-ui";
import { CustomerCodeBadge } from "@/components/ui/CustomerCodeBadge";

/**
 * A member of staff's work, as the people it belongs to.
 *
 * The console hands leads over one product at a time, but a customer who asks
 * about four things is one customer: same name, same number, four rows. This
 * folds them back together with the same key the console groups by (the last
 * ten digits of the phone — lib/customerGroups.ts), so a row here is a person
 * and opening it shows everything of theirs, each item expandable on its own.
 *
 *   - Tiles across the top: how many customers are yours, and where each
 *     outcome stands. Each one is also the filter for itself.
 *   - One list in a card: search, Quote requests / Contact messages, and the
 *     outcome filter above it; rows with the product's photograph, the
 *     customer, and the outcome so far.
 *   - A row opens the customer in full (CustomerDetail), where the outcome is
 *     recorded — once, for the customer, against every item they asked about.
 *
 * The page keeps itself current (useLiveRefresh): a lead assigned from /admin
 * appears here within half a minute without anybody reloading. Filtering is
 * client-side on purpose — the page already holds this person's whole list,
 * which is small by construction, so narrowing it should not cost a round trip.
 */

type OutcomeFilter = "all" | LeadOutcomeKey;
type KindFilter = "all" | "inquiry" | "contact";

/** Where a customer stands: their newest update's outcome, or not started. */
const outcomeFor = (g: CustomerLeadGroup) => outcomeOf(g.latest?.status);

export function EmployeeLeadBoard({
  leads, name, codes,
}: {
  leads: LeadCardData[];
  name: string | null;
  /** customerKey → AFFHAN-xxxx, the number the console shows for the same person. */
  codes: Record<string, string>;
}) {
  const { refresh, refreshing, updatedAt } = useLiveRefresh(30_000);
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  /**
   * Outcomes recorded here that the server's copy of the page may not have
   * yet, keyed by lead. Merged by id, so once the refresh brings them back
   * they are simply the server's rows again.
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

  const groups = useMemo(() => groupLeads(merged), [merged]);

  // The tiles describe the whole of this person's work, so they do not move
  // while somebody types.
  const totals = useMemo(() => {
    const m = new Map<LeadOutcomeKey, number>();
    for (const g of groups) m.set(outcomeFor(g), (m.get(outcomeFor(g)) ?? 0) + 1);
    return m;
  }, [groups]);

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return groups.filter(
      (g) =>
        (kind === "all" || (kind === "inquiry" ? g.inquiryCount > 0 : g.contactCount > 0)) &&
        (!needle || groupHaystack(g).includes(needle))
    );
  }, [groups, q, kind]);

  // The filter panel's counts follow the search and the tab, so a number on a
  // row is what choosing it would actually show.
  const filterCounts = useMemo(() => {
    const m = new Map<LeadOutcomeKey, number>();
    for (const g of searched) m.set(outcomeFor(g), (m.get(outcomeFor(g)) ?? 0) + 1);
    return m;
  }, [searched]);

  const shown = useMemo(
    () => (outcome === "all" ? searched : searched.filter((g) => outcomeFor(g) === outcome)),
    [searched, outcome]
  );

  const inquiryCount = merged.filter((l) => l.kind === "inquiry").length;
  const contactCount = merged.length - inquiryCount;
  const withInquiries = groups.filter((g) => g.inquiryCount > 0).length;
  const withContacts = groups.filter((g) => g.contactCount > 0).length;
  const open = openKey ? groups.find((g) => g.key === openKey) ?? null : null;
  const filtering = q.trim() !== "" || outcome !== "all" || kind !== "all";
  const clear = () => { setQ(""); setOutcome("all"); setKind("all"); };

  /**
   * An outcome has been recorded: say so, and get out of the way.
   *
   * The confirmation lives here rather than in the panel because "Not
   * attended" hands the customer to somebody else — the panel closes and the
   * row leaves the list in the same second, which without a word looks like
   * the screen threw the work away. The board survives both, so the message
   * outlives what it is about.
   */
  const recorded = (rows: RecordedUpdate[], status: LeadStatus) => {
    setPending((cur) => {
      const next = new Map(cur);
      for (const row of rows) next.set(row.lead, [row.update, ...(next.get(row.lead) ?? [])]);
      return next;
    });

    const items = rows.length;
    const covered = items === 1 ? "" : ` Recorded against all ${items} of their items.`;
    if (status === "NOT_ATTENDED") {
      // It is no longer theirs, so the panel must not sit open over a customer
      // they cannot act on any more.
      setOpenKey(null);
      setToast({ id: Date.now(), text: "Recorded. This customer has been passed to the next person.", tone: "moved" });
    } else {
      setToast({
        id: Date.now(),
        text: `Recorded — marked as ${LEAD_STATUS_META[status].label.toLowerCase()}.`,
        detail: covered.trim() || undefined,
        tone: "done",
      });
    }

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
              : `${groups.length} ${groups.length === 1 ? "customer" : "customers"} · ${merged.length} ${
                  merged.length === 1 ? "item" : "items"
                } assigned to you.`}
          </p>
        </div>
        <LiveRefreshButton onRefresh={refresh} refreshing={refreshing} updatedAt={updatedAt} />
      </div>

      {/* KPI row: stat tiles, not a chart — each is one number, and each is
          the filter for itself. Every tile counts CUSTOMERS, so they add up to
          the list below rather than to the number of rows behind it. Identity
          is the label; the dot beside it is the colour the same outcome wears
          everywhere else. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Your customers" value={groups.length} on={outcome === "all"} onClick={() => setOutcome("all")} />
        {STAFF_OUTCOME_ORDER.map((key) => (
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
              aria-label="Search your customers"
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

          {/* Counts are customers, like everything else on the page; the tab
              itself says what they asked for. */}
          <div className="flex flex-wrap items-center gap-2">
            {([
              ["all", "All", groups.length],
              ["inquiry", "Quote requests", withInquiries],
              ["contact", "Contact messages", withContacts],
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

        {groups.length > 0 && (
          <div className={`flex flex-wrap items-center gap-1.5 border-b px-4 py-2.5 text-[12px] ${wt.soft} ${wt.border}`}>
            <Users className="h-3.5 w-3.5" />
            {shown.length === groups.length
              ? `${groups.length} ${groups.length === 1 ? "customer" : "customers"}`
              : `${shown.length} of ${groups.length} customers`}
            {" · "}
            {inquiryCount} quote {inquiryCount === 1 ? "request" : "requests"}
            {contactCount > 0 && ` · ${contactCount} ${contactCount === 1 ? "message" : "messages"}`}
            {" · "}the same person’s products are on one row.
          </div>
        )}

        {shown.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <p className="text-[15px] font-semibold">{merged.length === 0 ? "Nothing assigned yet" : "Nothing matches"}</p>
            <p className={`mt-1 text-[13px] ${wt.soft}`}>
              {merged.length === 0
                ? "When a lead is assigned to you from the console it appears here — this page checks every half minute."
                : "No customer of yours matches that. Try a different search or outcome."}
            </p>
            {filtering && (
              <button type="button" onClick={clear} className={`mt-3 inline-flex items-center rounded-full px-4 py-2 text-[13px] font-semibold shadow-sm ${wt.pill}`}>
                Clear the filters
              </button>
            )}
          </div>
        ) : (
          <ul className={`divide-y ${wt.divide}`}>
            {shown.map((g) => (
              <CustomerRow key={g.key} group={g} code={codes[g.key]} outcome={outcomeFor(g)} onOpen={() => setOpenKey(g.key)} />
            ))}
          </ul>
        )}
      </div>

      {open && (
        <CustomerDetail group={open} code={codes[open.key]} onClose={() => setOpenKey(null)} onRecorded={recorded} />
      )}

      {/* Outside the panel on purpose: what it confirms often closes the panel
          and takes the row off the list in the same moment. */}
      <WorkspaceToast message={toast} onDone={() => setToast(null)} />
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

/**
 * One customer as a row: their photograph (the newest product they asked
 * about), who they are, and how much of them there is. What they asked about
 * is inside — a row that listed four product names would be four lines tall
 * and still not say they are one person.
 */
function CustomerRow({
  group, outcome, onOpen, code,
}: {
  group: CustomerLeadGroup;
  outcome: LeadOutcomeKey;
  onOpen: () => void;
  code?: string;
}) {
  const withImage = group.leads.find((l) => l.kind === "inquiry" && l.image);
  const thumb = withImage ? getCdnUrl(withImage.image, 160) : null;
  const meta = outcomeMeta(outcome);
  const extra = group.leads.length - 1;
  const newest = group.leads[0];
  // What they asked about, in one line: every product they want, newest first.
  // "The same customer asked about different things" is the fact the row has to
  // carry, and the product names are the only way to say it.
  const products = group.leads.filter((l) => l.kind === "inquiry").map((l) => l.title);
  const summary = products.length > 0 ? products.join(" · ") : newest?.message || "Contact message";

  // The row opens the customer, but the ID badge on it is a button, and a
  // button inside a button is invalid HTML React will not hydrate. The name
  // takes the click and stretches over the row with ::after; the badge sits
  // above it.
  return (
    <li className="relative transition-colors hover:bg-black/[0.02]">
      <div className="flex w-full flex-col gap-3 p-4 text-left sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="relative shrink-0">
            {thumb ? (
              <span className={`relative block h-16 w-16 overflow-hidden rounded-xl ${wt.thumb}`}>
                <Image src={thumb as string} alt="" fill sizes="64px" className="object-cover" />
              </span>
            ) : (
              <span className={`flex h-16 w-16 items-center justify-center rounded-xl ${wt.thumb} ${wt.soft}`}>
                {group.inquiryCount > 0 ? <Users className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
              </span>
            )}
            {extra > 0 && (
              <span className="absolute -bottom-1 -right-1 rounded-full bg-[#1d1d1f] px-1.5 py-0.5 text-[10px] font-bold text-white ring-2 ring-white">
                +{extra}
              </span>
            )}
          </span>

          <div className="min-w-0 flex-1">
            {/* The number beside the name: the handle they are referred to
                by when this card is discussed with the office. */}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-semibold leading-snug sm:text-[13.5px]">
              <button
                type="button"
                onClick={onOpen}
                className="line-clamp-2 text-left after:absolute after:inset-0 after:content-['']"
              >
                {group.customerName}
              </button>
              {code && (
                <span className="relative">
                  <CustomerCodeBadge code={code} chip={wt.chip} />
                </span>
              )}
            </p>
            <p className={`mt-0.5 line-clamp-1 text-[12.5px] ${wt.mid}`} title={summary}>
              {summary}
            </p>
            <div className={`mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] ${wt.mid}`}>
              {group.companyName && (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                  <Building2 className={`h-3 w-3 shrink-0 ${wt.soft}`} />
                  <span className="truncate">{group.companyName}</span>
                </span>
              )}
              {group.country && (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                  <MapPin className={`h-3 w-3 shrink-0 ${wt.soft}`} />
                  <span className="truncate">{group.country}</span>
                </span>
              )}
              {group.phone && (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                  <Phone className={`h-3 w-3 shrink-0 ${wt.soft}`} />
                  <span className="truncate tabular-nums">{group.phone}</span>
                </span>
              )}
              {group.email && (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                  <Mail className={`h-3 w-3 shrink-0 ${wt.soft}`} />
                  <span className="truncate">{group.email}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5 pl-[76px] sm:pl-0">
          {group.inquiryCount > 0 && (
            <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand-dark">
              {group.inquiryCount} {group.inquiryCount === 1 ? "product" : "products"}
            </span>
          )}
          {group.contactCount > 0 && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${wt.chip}`}>
              {group.contactCount} {group.contactCount === 1 ? "message" : "messages"}
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          <span className={`w-20 text-right text-[12px] ${wt.soft}`} title={formatDateTime(group.lastAt)}>
            {timeAgo(group.lastAt)}
          </span>
          <ChevronRight className={`hidden h-4 w-4 sm:block ${wt.soft}`} />
        </div>
      </div>
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

  const rows: OutcomeFilter[] = ["all", ...STAFF_OUTCOME_ORDER];
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
