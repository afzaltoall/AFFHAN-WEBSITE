"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Hand, Inbox, Loader2, MapPin, MessageSquare, Package, Search, Ship, X } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { formatDateTime, formatSince } from "@/lib/datetime";
import type { LeadRef, PoolRow, PoolView } from "@/lib/lead-pool";
import { wt } from "@/components/employee/workspace-ui";
import { CustomerCodeBadge } from "@/components/ui/CustomerCodeBadge";
import type { ToastMessage } from "@/components/employee/WorkspaceToast";
import { capitalized, customerLabel, poolLabel } from "@/lib/customer-label";

type KindFilter = "all" | "inquiry" | "contact" | "shipment";

// A new id for every toast, so the same words twice still re-show (WorkspaceToast).
let toastSeq = 0;
const toastId = () => ++toastSeq;

/**
 * The open pool, as a member of staff sees it: every customer nobody holds yet, newest request first.
 *
 * What a row says is all the pool may say before somebody takes the customer on: their AFFHAN number, what they
 * asked for (the products' photographs and titles, quantities), their country, when, and what kind of request.
 * Never a name, a number, an email or what they wrote; the server does not send them (lib/lead-pool.ts, listPool).
 *
 * Take claims the customer, every request and message of theirs, and their card opens on My leads. If somebody got
 * there first the answer says who; at the cap Take waits until the reader records an outcome or releases somebody;
 * and a customer the reader let go is theirs to take again from the next office day.
 *
 * The words name the customer as "customer <name>" once they are the reader's, and by their AFFHAN number before
 * that, always with what they asked for, so no customer reads as a member of staff (lib/customer-label.ts).
 */
export function OpenLeads({
  pool,
  onTaken,
  onToast,
  refresh,
}: {
  pool: PoolView;
  /** A Take went through: show the customer. */
  onTaken: (leads: LeadRef[], code: string | null) => void;
  onToast: (message: ToastMessage) => void;
  refresh: () => void;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const atCap = pool.held >= pool.cap;

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pool.rows.filter(
      (r) =>
        (kind === "all" || r.counts[kind] > 0) &&
        (!needle ||
          (r.code ?? "").toLowerCase().includes(needle) ||
          r.country.toLowerCase().includes(needle) ||
          r.items.some((i) => (i.title ?? "").toLowerCase().includes(needle))),
    );
  }, [pool.rows, q, kind]);

  const tabs: [KindFilter, string, number][] = [
    ["all", "All", pool.rows.length],
    ["inquiry", "Quote requests", pool.rows.filter((r) => r.counts.inquiry > 0).length],
    ["contact", "Contact messages", pool.rows.filter((r) => r.counts.contact > 0).length],
    ...(pool.rows.some((r) => r.counts.shipment > 0)
      ? [["shipment", "Freight requests", pool.rows.filter((r) => r.counts.shipment > 0).length] as [KindFilter, string, number]]
      : []),
  ];

  const take = async (row: PoolRow) => {
    setBusy(row.id);
    try {
      const res = await fetch("/api/employee/pool/take/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: row.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onToast({ id: toastId(), text: `You took ${customerLabel(data.name, row.items)}.`, detail: "Every request and message of theirs moved to My leads.", tone: "done" });
        onTaken(Array.isArray(data.leads) ? data.leads : [], data.code ?? null);
      } else if (res.status === 401) {
        onToast({ id: toastId(), text: "Your session has ended. Sign in again to take a customer.", tone: "moved" });
      } else if (res.status === 409 && typeof data.by === "string") {
        // Somebody else holds them now, so their name stays hidden: the AFFHAN number, and who got there first.
        onToast({ id: toastId(), text: `${capitalized(poolLabel(row.code, row.items))} was already taken by ${data.by}.`, tone: "moved" });
      } else {
        onToast({ id: toastId(), text: data.error || "Could not take this customer.", tone: "moved" });
      }
      refresh();
    } catch {
      onToast({ id: toastId(), text: "Network error. Try again.", tone: "moved" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
      <div className={`flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center ${wt.border}`}>
        <div className="relative flex-1 lg:max-w-sm">
          <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${wt.soft}`} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search AFFHAN number, product, country…"
            aria-label="Search the open pool"
            className={`h-10 w-full rounded-xl pl-9 pr-9 text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand/30 ${wt.input}`}
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className={`absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 ${wt.soft} hover:bg-black/[0.05]`}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map(([value, label, n]) => (
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
        <p className={`text-[12.5px] lg:ml-auto ${atCap ? "font-semibold text-amber-700" : wt.soft}`}>
          You hold {pool.held} of {pool.cap}
        </p>
      </div>

      {atCap && (
        <p role="status" className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-[13px] font-medium text-amber-800">
          You hold {pool.held} open customers, the most anyone may. Record Lead or No lead for one, or release one, to take another.
        </p>
      )}

      {searched.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <p className="text-[15px] font-semibold">{pool.rows.length === 0 ? "The pool is empty" : "Nothing matches"}</p>
          <p className={`mt-1 text-[13px] ${wt.soft}`}>
            {pool.rows.length === 0
              ? "Every customer is somebody's. New requests arrive here as customers send them; Refresh to check."
              : "No customer in the pool matches that. Try a different search or type."}
          </p>
        </div>
      ) : (
        <ul className={`space-y-2 p-3 ${wt.page}`}>
          {searched.map((row) => (
            <PoolCard key={row.id} row={row} at={pool.at} busy={busy === row.id} disabled={busy !== null || atCap} onTake={() => void take(row)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PoolCard({ row, at, busy, disabled, onTake }: { row: PoolRow; at: string; busy: boolean; disabled: boolean; onTake: () => void }) {
  const products = row.items.filter((i) => i.kind === "inquiry");
  const withImage = products.find((i) => i.image);
  const thumb = withImage ? getCdnUrl(withImage.image, 160) : null;
  const titles = products.map((p) => p.title).filter(Boolean) as string[];
  const quantity = products.reduce((n, p) => n + (p.quantity ?? 0), 0);
  const summary =
    titles.length > 0 ? titles.join(" · ") : row.counts.shipment > 0 ? "Freight request" : row.counts.contact > 0 ? "Contact message" : "Request";
  const waiting = row.retakeFrom !== null;
  // "Take AFFHAN-0123 (O-neck T-Shirt)": the pool may not name the customer before Take (lib/customer-label.ts).
  const takeLabel = `Take ${poolLabel(row.code, row.items)}`;

  return (
    <li className={`rounded-xl shadow-sm ring-1 ${wt.card}`}>
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="relative shrink-0">
            {thumb ? (
              <span className={`relative block h-16 w-16 overflow-hidden rounded-xl ${wt.thumb}`}>
                <Image src={thumb as string} alt="" fill sizes="64px" className="object-cover" />
              </span>
            ) : (
              <span className={`flex h-16 w-16 items-center justify-center rounded-xl ${wt.thumb} ${wt.soft}`}>
                {row.counts.shipment > 0 ? <Ship className="h-6 w-6" /> : row.counts.contact > 0 ? <MessageSquare className="h-6 w-6" /> : <Package className="h-6 w-6" />}
              </span>
            )}
            {row.items.length > 1 && (
              <span className="absolute -bottom-1 -right-1 rounded-full bg-[#1d1d1f] px-1.5 py-0.5 text-[10px] font-bold text-white ring-2 ring-white">
                +{row.items.length - 1}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {row.code ? <CustomerCodeBadge code={row.code} chip={wt.chip} /> : <span className={`text-[12px] ${wt.soft}`}>New customer</span>}
              <span className={`inline-flex items-center gap-1 text-[12px] ${wt.mid}`}>
                <MapPin className={`h-3 w-3 ${wt.soft}`} />
                {row.country || "Country not given"}
              </span>
            </p>
            <p className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug" title={summary}>
              {summary}
            </p>
            <div className={`mt-1.5 flex flex-wrap items-center gap-2 text-[12px] ${wt.mid}`}>
              {row.counts.inquiry > 0 && (
                <span className="rounded-full bg-brand/10 px-2.5 py-0.5 font-semibold text-brand-dark">
                  {row.counts.inquiry} {row.counts.inquiry === 1 ? "product" : "products"}
                  {quantity > 0 ? ` · Qty ${quantity.toLocaleString("en-GB")}` : ""}
                </span>
              )}
              {row.counts.contact > 0 && (
                <span className={`rounded-full px-2.5 py-0.5 font-semibold ${wt.chip}`}>
                  {row.counts.contact} {row.counts.contact === 1 ? "message" : "messages"}
                </span>
              )}
              {row.counts.shipment > 0 && (
                <span className="rounded-full bg-brand/10 px-2.5 py-0.5 font-semibold text-brand-dark">
                  {row.counts.shipment} freight {row.counts.shipment === 1 ? "request" : "requests"}
                </span>
              )}
              {/* The moment it arrived, written against the time the pool was read rather than the reader's clock,
                  so the server's draw and the browser's agree. */}
              <span className={`inline-flex items-center gap-1 ${wt.soft}`} title={formatDateTime(row.receivedAt)}>
                <Inbox className="h-3 w-3" />
                {formatSince(row.receivedAt, new Date(at))}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1 pl-[76px] sm:items-end sm:pl-0">
          <button
            type="button"
            onClick={onTake}
            disabled={disabled || waiting}
            title={takeLabel}
            className="inline-flex max-w-full items-center justify-center gap-2 rounded-xl bg-brand-dark px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-[18rem]"
          >
            {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Hand className="h-4 w-4 shrink-0" />}
            <span className="truncate">{takeLabel}</span>
          </button>
          {waiting && <span className="text-[11.5px] text-amber-700">You let them go: yours to take again from {formatDateTime(row.retakeFrom!)}</span>}
        </div>
      </div>
    </li>
  );
}

export default OpenLeads;
