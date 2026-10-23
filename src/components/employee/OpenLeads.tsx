"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Eye, Hand, Inbox, Loader2, Lock, MapPin, MessageSquareText, Package, Plane, Search, Ship, X } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { formatDateTime, formatSince } from "@/lib/datetime";
import type { LeadRef, PoolFreight, PoolItem, PoolRow, PoolView } from "@/lib/lead-pool";
import { commodityTypeLabel, methodLabel, modeLabel, termsLabel, termsName } from "@/lib/shipment-inquiry";
import { useBackDismiss } from "@/lib/useBackDismiss";
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
 * asked for (the products' photographs and titles, quantities; a freight request's route and load), their country,
 * when, and what kind of request. Never a name, a number, an email or what they wrote; the server does not send them
 * (lib/lead-pool.ts, listPool).
 *
 * Every card opens (the owner, 2026-10-23: "can't open and view"): the customer's view lists each request in full,
 * every product with its photograph, title, quantity and page, every freight request's route and load, every message
 * as the fact of it, with Take at its foot. A message or a freight request has no photograph, so its card wears a tile
 * of its own kind (a ship or a plane, a message), never the grey square that read as a picture that failed to load.
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
  /** The customer whose view is open, by their place in the pool; looked up live, so a refresh shows the new rows. */
  const [openId, setOpenId] = useState<string | null>(null);
  const atCap = pool.held >= pool.cap;
  const openRow = openId ? pool.rows.find((r) => r.id === openId) ?? null : null;

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pool.rows.filter(
      (r) =>
        (kind === "all" || r.counts[kind] > 0) &&
        (!needle ||
          (r.code ?? "").toLowerCase().includes(needle) ||
          r.country.toLowerCase().includes(needle) ||
          r.items.some((i) => `${i.title ?? ""} ${i.freight ? `${i.freight.from} ${i.freight.to}` : ""}`.toLowerCase().includes(needle))),
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
        setOpenId(null);
        onTaken(Array.isArray(data.leads) ? data.leads : [], data.code ?? null);
      } else if (res.status === 401) {
        onToast({ id: toastId(), text: "Your session has ended. Sign in again to take a customer.", tone: "moved" });
      } else if (res.status === 409 && typeof data.by === "string") {
        // Somebody else holds them now, so their name stays hidden: the AFFHAN number, and who got there first.
        setOpenId(null);
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
            placeholder="Search AFFHAN number, product, port, country…"
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
            <PoolCard
              key={row.id}
              row={row}
              at={pool.at}
              busy={busy === row.id}
              disabled={busy !== null || atCap}
              onOpen={() => setOpenId(row.id)}
              onTake={() => void take(row)}
            />
          ))}
        </ul>
      )}

      {openRow && (
        <PoolCustomerView
          row={openRow}
          at={pool.at}
          busy={busy === openRow.id}
          disabled={busy !== null || atCap}
          atCap={atCap}
          onClose={() => setOpenId(null)}
          onTake={() => void take(openRow)}
        />
      )}
    </div>
  );
}

// ---- what a card is made of ---------------------------------------------------------------------------------------------

const products = (row: PoolRow) => row.items.filter((i) => i.kind === "inquiry");
const freightOf = (row: PoolRow) => row.items.filter((i): i is PoolItem & { freight: PoolFreight } => i.kind === "shipment" && i.freight !== null);
const fig = (v: string | number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
/** "Sea · FCL · Shenzhen → Chennai"; "Air · Guangzhou → Dubai" (air has one method, so it is not said twice). */
const routeOf = (f: PoolFreight) => `${modeLabel(f.mode)}${f.mode === "AIR" ? "" : ` · ${methodLabel(f.method)}`} · ${f.from} → ${f.to}`;
/** "Sea freight · FCL"; "Air freight". */
const howOf = (f: PoolFreight) => (f.mode === "AIR" ? "Air freight" : `${modeLabel(f.mode)} freight · ${methodLabel(f.method)}`);
/** "68 m³ · 6,500 kg · 120 cartons". */
const loadOf = (f: PoolFreight) =>
  [`${fig(f.cbm)} m³`, `${fig(f.weightKg)} kg`, ...(f.cartons ? [`${f.cartons.toLocaleString("en-IN")} carton${f.cartons === 1 ? "" : "s"}`] : [])].join(" · ");

/**
 * The picture at a card's left: the first product photograph when there is one; otherwise a tile of what the request
 * is, so a message or a freight request reads as itself rather than as a picture that did not load.
 */
function PoolTile({ row, size = 64 }: { row: PoolRow; size?: 56 | 64 }) {
  const photo = products(row).find((i) => i.image);
  const box = size === 64 ? "h-16 w-16" : "h-14 w-14";
  if (photo) {
    return (
      <span className={`relative block overflow-hidden rounded-xl ${box} ${wt.thumb}`}>
        <Image src={getCdnUrl(photo.image, 160) as string} alt="" fill sizes={`${size}px`} className="object-cover" />
      </span>
    );
  }
  const first = row.items[0];
  const air = first?.kind === "shipment" && first.freight?.mode === "AIR";
  const look =
    first?.kind === "shipment"
      ? { tone: air ? "from-indigo-500 to-violet-600" : "from-sky-500 to-blue-700", Icon: air ? Plane : Ship, word: air ? "Air" : "Sea" }
      : first?.kind === "contact"
        ? { tone: "from-emerald-500 to-teal-600", Icon: MessageSquareText, word: "Message" }
        : { tone: "from-brand to-brand-dark", Icon: Package, word: "Product" };
  return (
    <span aria-hidden="true" className={`flex flex-col items-center justify-center gap-0.5 rounded-xl bg-gradient-to-br text-white shadow-inner ${box} ${look.tone}`}>
      <look.Icon className="h-6 w-6" strokeWidth={1.9} />
      <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-white/90">{look.word}</span>
    </span>
  );
}

function PoolCard({ row, at, busy, disabled, onOpen, onTake }: { row: PoolRow; at: string; busy: boolean; disabled: boolean; onOpen: () => void; onTake: () => void }) {
  const list = products(row);
  const freight = freightOf(row);
  const titles = list.map((p) => p.title).filter(Boolean) as string[];
  const quantity = list.reduce((n, p) => n + (p.quantity ?? 0), 0);
  // What they asked for, in a line: the products' titles; else the newest freight request's route; else the message.
  const summary = titles.length > 0 ? titles.join(" · ") : freight.length > 0 ? routeOf(freight[0].freight) : row.counts.contact > 0 ? "Contact message" : "Request";
  const waiting = row.retakeFrom !== null;
  // "Take AFFHAN-0123 (O-neck T-Shirt)": the pool may not name the customer before Take (lib/customer-label.ts).
  const takeLabel = `Take ${poolLabel(row.code, row.items)}`;
  const viewLabel = `View ${poolLabel(row.code, row.items)}`;

  return (
    <li className={`rounded-xl shadow-sm ring-1 transition-shadow hover:shadow-md ${wt.card}`}>
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
        {/* The card itself opens the customer's view: everything the pool may show of them, in full. */}
        <button type="button" onClick={onOpen} aria-haspopup="dialog" aria-label={viewLabel} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
          <span className="relative shrink-0">
            <PoolTile row={row} />
            {row.items.length > 1 && (
              <span className="absolute -bottom-1 -right-1 rounded-full bg-[#1d1d1f] px-1.5 py-0.5 text-[10px] font-bold text-white ring-2 ring-white">
                +{row.items.length - 1}
              </span>
            )}
          </span>
          <span className="block min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {row.code ? <CustomerCodeBadge code={row.code} chip={wt.chip} /> : <span className={`text-[12px] ${wt.soft}`}>New customer</span>}
              <span className={`inline-flex items-center gap-1 text-[12px] ${wt.mid}`}>
                <MapPin className={`h-3 w-3 ${wt.soft}`} />
                {row.country || "Country not given"}
              </span>
            </span>
            {/* line-clamp is its own display (-webkit-box): a `block` beside it would undo the clamp. */}
            <span className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug" title={summary}>
              {summary}
            </span>
            <span className={`mt-1.5 flex flex-wrap items-center gap-2 text-[12px] ${wt.mid}`}>
              {row.counts.inquiry > 0 && (
                <span className="rounded-full bg-brand/10 px-2.5 py-0.5 font-semibold text-brand-dark">
                  {row.counts.inquiry} {row.counts.inquiry === 1 ? "product" : "products"}
                  {quantity > 0 ? ` · Qty ${quantity.toLocaleString("en-GB")}` : ""}
                </span>
              )}
              {row.counts.shipment > 0 && (
                <span className="rounded-full bg-sky-500/10 px-2.5 py-0.5 font-semibold text-sky-800">
                  {row.counts.shipment} freight {row.counts.shipment === 1 ? "request" : "requests"}
                  {freight.length > 0 && row.counts.shipment === 1 ? ` · ${loadOf(freight[0].freight)}` : ""}
                </span>
              )}
              {row.counts.contact > 0 && (
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-semibold text-emerald-800">
                  {row.counts.contact} {row.counts.contact === 1 ? "message" : "messages"}
                </span>
              )}
              {/* The moment it arrived, written against the time the pool was read rather than the reader's clock,
                  so the server's draw and the browser's agree. */}
              <span className={`inline-flex items-center gap-1 ${wt.soft}`} title={formatDateTime(row.receivedAt)}>
                <Inbox className="h-3 w-3" />
                {formatSince(row.receivedAt, new Date(at))}
              </span>
            </span>
          </span>
        </button>
        <div className="flex shrink-0 flex-col items-stretch gap-1 pl-[76px] sm:items-end sm:pl-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpen}
              aria-haspopup="dialog"
              title={viewLabel}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-[#1d1d1f] ring-1 ring-black/[0.08] transition-colors hover:bg-black/[0.03]"
            >
              <Eye className="h-4 w-4 shrink-0" />
              View
            </button>
            <button
              type="button"
              onClick={onTake}
              disabled={disabled || waiting}
              title={takeLabel}
              className="inline-flex min-w-0 max-w-full items-center justify-center gap-2 rounded-xl bg-brand-dark px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-[18rem]"
            >
              {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Hand className="h-4 w-4 shrink-0" />}
              <span className="truncate">{takeLabel}</span>
            </button>
          </div>
          {waiting && <span className="text-[11.5px] text-amber-700">You let them go: yours to take again from {formatDateTime(row.retakeFrom!)}</span>}
        </div>
      </div>
    </li>
  );
}

// ---- the customer's view ----------------------------------------------------------------------------------------------

/**
 * Everything the pool may show of one customer, in full, before anybody takes them: a panel at the side on a computer,
 * a sheet from the bottom on a phone. Escape, the close button, a press outside and the phone's Back close it; Take
 * is at its foot. Their name, contact and what they wrote are not here because the server never sent them.
 */
function PoolCustomerView({
  row, at, busy, disabled, atCap, onClose, onTake,
}: { row: PoolRow; at: string; busy: boolean; disabled: boolean; atCap: boolean; onClose: () => void; onTake: () => void }) {
  const list = products(row);
  const freight = freightOf(row);
  const messages = row.items.filter((i) => i.kind === "contact");
  const quantity = list.reduce((n, p) => n + (p.quantity ?? 0), 0);
  const now = new Date(at);
  const waiting = row.retakeFrom !== null;
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const heading = `pool-view-${row.id}`;

  useBackDismiss(true, onClose);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Tab stays inside the panel while it is open.
      if (e.key === "Tab" && panel.current) {
        const focusable = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      before?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/35 backdrop-blur-[2px] sm:items-stretch sm:justify-end" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-none sm:max-w-[34rem] sm:rounded-none sm:rounded-l-3xl"
      >
        <div className={`flex items-start gap-3 border-b px-5 py-4 ${wt.border}`}>
          <span className="relative shrink-0">
            <PoolTile row={row} size={56} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={heading} className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
              {row.code ? <CustomerCodeBadge code={row.code} chip={wt.chip} /> : "New customer"}
            </h2>
            <p className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] ${wt.mid}`}>
              <span className="inline-flex items-center gap-1">
                <MapPin className={`h-3.5 w-3.5 ${wt.soft}`} />
                {row.country || "Country not given"}
              </span>
              <span className="inline-flex items-center gap-1" title={formatDateTime(row.waitingSince)}>
                <Inbox className={`h-3.5 w-3.5 ${wt.soft}`} />
                In the pool since {formatSince(row.waitingSince, now)}
              </span>
            </p>
            <p className={`mt-1 text-[12.5px] ${wt.soft}`}>
              {[
                list.length ? `${list.length} ${list.length === 1 ? "product" : "products"}${quantity ? `, Qty ${quantity.toLocaleString("en-GB")}` : ""}` : "",
                row.counts.shipment ? `${row.counts.shipment} freight ${row.counts.shipment === 1 ? "request" : "requests"}` : "",
                messages.length ? `${messages.length} ${messages.length === 1 ? "message" : "messages"}` : "",
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Close" className={`-mr-1 rounded-full p-2 transition-colors hover:bg-black/[0.05] ${wt.soft}`}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={`flex-1 space-y-5 overflow-y-auto px-5 py-4 ${wt.page}`}>
          {list.length > 0 && (
            <section aria-label="Products">
              <h3 className={`mb-2 text-[11px] font-bold uppercase tracking-[0.08em] ${wt.soft}`}>Products · {list.length}</h3>
              <ul className="space-y-2">
                {list.map((p, n) => (
                  <li key={`p-${n}`} className={`flex items-center gap-3 rounded-xl p-2.5 ${wt.card}`}>
                    {p.image ? (
                      <span className={`relative block h-14 w-14 shrink-0 overflow-hidden rounded-lg ${wt.thumb}`}>
                        <Image src={getCdnUrl(p.image, 160) as string} alt="" fill sizes="56px" className="object-cover" />
                      </span>
                    ) : (
                      <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-dark text-white">
                        <Package className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold leading-snug">{p.title || "A product no longer in the catalogue"}</p>
                      <p className={`mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] ${wt.mid}`}>
                        {p.quantity ? <span className="rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand-dark">Qty {p.quantity.toLocaleString("en-GB")}</span> : null}
                        <span className={wt.soft} title={formatDateTime(p.receivedAt)}>{formatSince(p.receivedAt, now)}</span>
                        {p.productId ? (
                          <Link href={`/products/${p.productId}/`} target="_blank" className="inline-flex items-center gap-0.5 font-semibold text-brand-dark hover:underline">
                            Product page <ArrowRight className="h-3 w-3" />
                          </Link>
                        ) : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {freight.length > 0 && (
            <section aria-label="Freight requests">
              <h3 className={`mb-2 text-[11px] font-bold uppercase tracking-[0.08em] ${wt.soft}`}>Freight requests · {freight.length}</h3>
              <ul className="space-y-2">
                {freight.map(({ freight: f, receivedAt }, n) => {
                  const air = f.mode === "AIR";
                  const Icon = air ? Plane : Ship;
                  return (
                    <li key={`f-${n}`} className={`rounded-xl p-3.5 ${wt.card}`}>
                      <div className="flex items-center gap-2">
                        <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br text-white ${air ? "from-indigo-500 to-violet-600" : "from-sky-500 to-blue-700"}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <p className="text-[13px] font-semibold">{howOf(f)}</p>
                        <span className={`ml-auto text-[12px] ${wt.soft}`} title={formatDateTime(receivedAt)}>{formatSince(receivedAt, now)}</span>
                      </div>
                      {/* The route, large: it is the thing a freight request is. */}
                      <p className="mt-2.5 flex flex-wrap items-center gap-2 text-[15px] font-semibold leading-snug">
                        <span>{f.from}</span>
                        <ArrowRight className={`h-4 w-4 shrink-0 ${wt.soft}`} aria-label="to" />
                        <span>{f.to}</span>
                      </p>
                      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-3">
                        <Fact term="Cargo" value={commodityTypeLabel(f.cargo)} />
                        <Fact term="Volume" value={`${fig(f.cbm)} m³`} />
                        <Fact term="Weight" value={`${fig(f.weightKg)} kg`} />
                        {f.cartons ? <Fact term="Cartons" value={f.cartons.toLocaleString("en-IN")} /> : null}
                        <Fact term="Terms" value={f.terms === "OTHER" ? "Other" : `${termsLabel(f.terms)} · ${termsName(f.terms)}`} />
                      </dl>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {messages.length > 0 && (
            <section aria-label="Contact messages">
              <h3 className={`mb-2 text-[11px] font-bold uppercase tracking-[0.08em] ${wt.soft}`}>Contact messages · {messages.length}</h3>
              <ul className="space-y-2">
                {messages.map((m, n) => (
                  <li key={`m-${n}`} className={`flex items-center gap-3 rounded-xl p-3 ${wt.card}`}>
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                      <MessageSquareText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold">Wrote to us through the contact form</p>
                      <p className={`text-[12px] ${wt.soft}`}>What they wrote opens once you take them.</p>
                    </div>
                    <span className={`shrink-0 text-[12px] ${wt.soft}`} title={formatDateTime(m.receivedAt)}>{formatSince(m.receivedAt, now)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className={`border-t bg-white px-5 py-4 ${wt.border}`}>
          <p className={`mb-3 flex items-start gap-2 text-[12px] leading-snug ${wt.soft}`}>
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Their name, number, email and what they wrote open once you take them.
          </p>
          {waiting ? (
            <p className="text-[12.5px] font-medium text-amber-700">You let them go: yours to take again from {formatDateTime(row.retakeFrom!)}.</p>
          ) : atCap ? (
            <p className="text-[12.5px] font-medium text-amber-700">You hold the most open customers anyone may. Record Lead or No lead for one, or release one, first.</p>
          ) : null}
          <button
            type="button"
            onClick={onTake}
            disabled={disabled || waiting}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-dark px-4 py-3 text-[14px] font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Hand className="h-4 w-4 shrink-0" />}
            <span className="truncate">Take {row.code ?? "this customer"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className={`text-[11px] ${wt.soft}`}>{term}</dt>
      <dd className="truncate font-semibold" title={value}>{value}</dd>
    </div>
  );
}

export default OpenLeads;
