"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Boxes, Building2, Calendar, ChevronDown, ExternalLink, FileText, Inbox, Layers, Loader2, Mail, MapPin, MessageCircle,
  MessageSquare, Package, Phone, PhoneCall, Plane, Scale, Ship, Users, X, ZoomIn, type LucideIcon,
} from "lucide-react";
import {
  commodityTypeLabel, methodLabel, methodName, modeLabel, termsLabel, termsName,
} from "@/lib/shipment-inquiry";
import { getCdnUrl } from "@/lib/cdn";
import { timeAgo } from "@/lib/relative-time";
import { formatDateTime } from "@/lib/datetime";
import {
  LEAD_NOTE_MAX, LEAD_STATUSES, LEAD_STATUS_META, leadStatusChip, leadStatusLabel, NOT_STARTED_META,
  showsTimeToStaff, type LeadStatus,
} from "@/lib/leadStatus";
import { batchesOf, type CustomerLeadGroup } from "@/components/employee/lead-groups";
import { leadKey, type LeadCardData, type LeadUpdate } from "@/components/employee/lead-types";
import { wt } from "@/components/employee/workspace-ui";
import { CustomerCodeBadge } from "@/components/ui/CustomerCodeBadge";

const waLink = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;

/** One row the caller should merge into its own copy of the trail. */
export interface RecordedUpdate {
  /** `leadKey()` of the lead it was written against. */
  lead: string;
  update: LeadUpdate;
}

/**
 * One customer, opened out: who they are, everything they have asked about,
 * and the place to say what happened.
 *
 * The shape is the console's inquiry drawer turned inside out. There, a panel
 * is one product and the customer's details are repeated on each; here the
 * customer is the panel — their name, number and address stated once at the
 * top — and their products are a list inside it, each one opening to its own
 * photograph, quantity, message and date. That is the difference between
 * four leads and one conversation, and it is how the person on the phone
 * actually works: they ring Ravi once, not once per product.
 *
 * The outcome is recorded against the customer for the same reason, and
 * lands as one entry per product (see the status route). The history below
 * shows those rows back as the single action that wrote them.
 */
export function CustomerDetail({
  group,
  code,
  onClose,
  onRecorded,
}: {
  group: CustomerLeadGroup;
  /** Their AFFHAN number, when one has been issued. */
  code?: string;
  onClose: () => void;
  /**
   * The rows to merge, and what was recorded — the board says so out loud, and
   * closes this panel when the customer has just left the person reading it.
   */
  onRecorded: (rows: RecordedUpdate[], status: LeadStatus) => void;
}) {
  const [zoom, setZoom] = useState<string | null>(null);
  const [choice, setChoice] = useState<LeadStatus | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // The newest thing they asked about is open to begin with: it is what the
  // call is about, and it shows at a glance that a line opens.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(group.leads[0] ? [leadKey(group.leads[0])] : [])
  );
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const batches = batchesOf(group.updates);
  const itemCount = group.leads.length;

  // The page behind stays put, Escape closes (the enlarged photograph first),
  // and the keyboard starts inside the panel.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (zoom) setZoom(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, onClose]);

  const toggle = (key: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const record = async () => {
    if (!choice) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/employee/leads/status/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: group.leads.map((l) => ({ kind: l.kind, id: l.id })),
          status: choice,
          note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          res.status === 401
            ? "Your session has ended. Sign in again to record this."
            : data.error || "Could not record that."
        );
        return;
      }
      const rows: RecordedUpdate[] = (data.updates ?? []).map(
        (u: { id: string; status: string; note: string | null; createdAt: string; kind: string; leadId: string }) => ({
          lead: `${u.kind}:${u.leadId}`,
          update: {
            id: u.id,
            status: u.status,
            note: u.note,
            createdAt: u.createdAt,
            byName: "you",
            byMe: true,
          },
        })
      );
      onRecorded(rows, choice);
      setChoice(null);
      setNote("");
      setSavedAt(Date.now());
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const tel = group.phone ? `tel:${group.phone.replace(/[^0-9+]/g, "")}` : null;
  const countLine = [
    group.inquiryCount > 0 ? `${group.inquiryCount} ${group.inquiryCount === 1 ? "product" : "products"}` : "",
    group.contactCount > 0 ? `${group.contactCount} ${group.contactCount === 1 ? "message" : "messages"}` : "",
    group.shipmentCount > 0 ? `${group.shipmentCount} freight ${group.shipmentCount === 1 ? "request" : "requests"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/50" />
      {/* Wider than the console's single-lead drawer on purpose: this one holds
          a customer's whole basket, and a 768px column made a four-item list
          scroll for no reason on a desk monitor. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-detail-title"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white text-[#1d1d1f] shadow-2xl ring-1 ring-black/[0.06]"
      >
        <div className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${wt.border}`}>
          <div className="min-w-0">
            <h2 id="customer-detail-title" className="truncate text-lg font-semibold leading-snug">
              {group.customerName}
            </h2>
            <p className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] ${wt.soft}`}>
              {code && <CustomerCodeBadge code={code} chip={wt.chip} />}
              <span>{countLine} · last activity {timeAgo(group.lastAt)}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <OutcomeBadge status={group.latest?.status ?? null} />
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Close"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${wt.thumb} ${wt.soft} hover:text-brand-dark`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* min-h-0 so the body scrolls inside the panel instead of the panel
            being cropped — the console's drawer learned this on phones. */}
        <div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain p-5">
          {/* ---- who they are: once, at the top ---- */}
          <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
            <Fact icon={Users} label="Customer" value={group.customerName} />
            {group.companyName && <Fact icon={Building2} label="Company" value={group.companyName} />}
            {group.country && <Fact icon={MapPin} label="Country" value={group.country} />}
            {group.phone && <Fact icon={Phone} label="Phone" value={group.phone} href={tel ?? undefined} />}
            {group.email && <Fact icon={Mail} label="Email" value={group.email} href={`mailto:${group.email}`} />}
            <Fact icon={Inbox} label="First" value={formatDateTime(group.firstAt)} />
            {group.lastAt !== group.firstAt && (
              <Fact icon={Calendar} label="Latest" value={formatDateTime(group.lastAt)} />
            )}
            {group.totalQuantity > 0 && (
              <Fact icon={Package} label="Total qty" value={group.totalQuantity.toLocaleString("en-GB")} />
            )}
          </dl>
          {(group.altNames.length > 0 || group.altEmails.length > 0) && (
            <p className={`mt-2 text-[12px] ${wt.soft}`}>
              {group.altNames.length > 0 && <>Has also written in as {group.altNames.join(", ")}. </>}
              {group.altEmails.length > 0 && <>Other email: {group.altEmails.join(", ")}.</>}
            </p>
          )}

          {/* ---- what they asked about: one line each, each one opens ---- */}
          <div className={`mt-5 border-t pt-4 ${wt.border}`}>
            <p className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${wt.soft}`}>
              What they asked about · {itemCount}
            </p>
            <ul className={`divide-y overflow-hidden rounded-2xl ring-1 ring-black/[0.06] ${wt.divide}`}>
              {group.leads.map((lead) => (
                <ItemPanel
                  key={leadKey(lead)}
                  lead={lead}
                  open={expanded.has(leadKey(lead))}
                  onToggle={() => toggle(leadKey(lead))}
                  onZoom={setZoom}
                />
              ))}
            </ul>
          </div>

          {/* ---- what happened: to the customer, not to one product ---- */}
          <div className={`mt-5 border-t pt-4 ${wt.border}`}>
            <p className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${wt.soft}`}>Record what happened</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {LEAD_STATUSES.map((s) => {
                const on = choice === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setChoice(on ? null : s); setSavedAt(null); }}
                    title={LEAD_STATUS_META[s].hint}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 transition-colors ${
                      on ? "bg-[#1d1d1f] text-white ring-transparent" : "bg-white text-[#1d1d1f] ring-black/[0.08] hover:bg-black/[0.02]"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-white/70" : LEAD_STATUS_META[s].dot}`} />
                    {LEAD_STATUS_META[s].label}
                  </button>
                );
              })}
            </div>

            {choice && (
              <div className="mt-2.5">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, LEAD_NOTE_MAX))}
                  rows={3}
                  autoFocus
                  placeholder={`${LEAD_STATUS_META[choice].hint} — add a note if it helps (optional)`}
                  className="w-full rounded-xl border border-black/[0.08] px-3 py-2 text-[13px] outline-none transition-shadow focus:ring-2 focus:ring-brand/30"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void record()}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-dark px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Record {LEAD_STATUS_META[choice].label.toLowerCase()}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setChoice(null); setNote(""); setError(null); }}
                    className={`rounded-xl px-3 py-2 text-[13px] font-semibold ${wt.soft} hover:text-[#1d1d1f]`}
                  >
                    Cancel
                  </button>
                  <span className={`text-[11px] ${wt.soft}`}>
                    {note.length > LEAD_NOTE_MAX - 100 ? `${LEAD_NOTE_MAX - note.length} characters left · ` : ""}
                    {itemCount === 1
                      ? "Added as a new entry — nothing already written changes."
                      : `Recorded against all ${itemCount} of their items, as one entry each.`}
                  </span>
                </div>
              </div>
            )}
            {!choice && (
              savedAt ? (
                <p className="mt-2 text-[12.5px] font-medium text-emerald-700">Recorded. The office sees it now.</p>
              ) : (
                itemCount > 1 && (
                  <p className={`mt-2 text-[12px] ${wt.soft}`}>
                    Whatever you choose covers this customer — all {itemCount} of their items.
                  </p>
                )
              )
            )}
            {error && <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-[12.5px] font-medium text-red-700">{error}</p>}

            <p className={`mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide ${wt.soft}`}>
              History {batches.length > 0 && `· ${batches.length}`}
            </p>
            {batches.length === 0 ? (
              <p className={`text-[13px] ${wt.soft}`}>Nothing recorded yet. Whatever you record appears here, newest first.</p>
            ) : (
              <ol className="space-y-2.5 border-l-2 border-black/[0.06] pl-3">
                {batches.map((b) => {
                  // In progress is shown without its clock here, and with it in
                  // the admin's views — leadStatus.ts says why. The tooltip goes
                  // with it, or hovering would give away what the line does not.
                  const timed = showsTimeToStaff(b.status);
                  return (
                  <li key={b.id} className="text-[12.5px]">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${leadStatusChip(b.status)}`}>
                        {leadStatusLabel(b.status)}
                      </span>
                      <span className={wt.soft} {...(timed ? { title: formatDateTime(b.createdAt) } : {})}>
                        {timed ? `${timeAgo(b.createdAt)} · ` : ""}{b.byMe ? "you" : b.byName}
                        {b.titles.length > 1 && ` · ${b.titles.length} items`}
                      </span>
                    </span>
                    {b.note && <p className="mt-0.5 whitespace-pre-line text-[#48484a]">{b.note}</p>}
                    {b.titles.length === 1 && itemCount > 1 && (
                      <p className={`mt-0.5 truncate text-[11.5px] ${wt.soft}`}>{b.titles[0]}</p>
                    )}
                  </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        {/* Reaching the customer is what the panel is for, so the ways to do it
            stay in reach however far the history above runs. */}
        <div className={`flex flex-wrap items-center gap-2 border-t px-5 py-3.5 ${wt.border}`}>
          {tel && (
            <a href={tel} className="inline-flex items-center gap-2 rounded-full bg-brand-dark px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-brand-deep">
              <PhoneCall className="h-3.5 w-3.5" /> Call
            </a>
          )}
          {group.phone && (
            <a href={waLink(group.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
          {group.email && (
            <a href={`mailto:${group.email}`} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-[#1d1d1f] ring-1 ring-black/[0.08] transition-colors hover:bg-black/[0.02]">
              <Mail className="h-3.5 w-3.5" /> Email
            </a>
          )}
        </div>
      </div>

      {zoom && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-4"
          onClick={(e) => { e.stopPropagation(); setZoom(null); }}
          role="dialog"
          aria-label="Enlarged photograph"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" className="max-h-[90dvh] max-w-[92vw] rounded-2xl bg-white object-contain" />
          <button
            type="button"
            onClick={() => setZoom(null)}
            aria-label="Close photograph"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#1d1d1f] shadow"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** "68", "12.5", "6,500": a freight figure as the office reads it. */
const figure = (v: string) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });

/**
 * One thing the customer asked about — a product, the message they wrote, or
 * a shipment they want moved.
 *
 * Closed it is a line you can scan: photograph, name, quantity, when. Open it
 * is everything the office holds about that one item, the rest of the
 * product's photographs included, because a salesperson on a call gets asked
 * "the black one or the brown one?".
 */
function ItemPanel({
  lead, open, onToggle, onZoom,
}: {
  lead: LeadCardData;
  open: boolean;
  onToggle: () => void;
  onZoom: (src: string) => void;
}) {
  const [shown, setShown] = useState(0);
  const images = lead.images.length ? lead.images : lead.image ? [lead.image] : [];
  const main = images[Math.min(shown, images.length - 1)] ?? null;
  const thumb = main ? getCdnUrl(main, 160) : null;
  const latest = lead.updates[0] ?? null;
  const freight = lead.kind === "shipment" ? lead.freight ?? null : null;
  const FreightIcon = freight?.mode === "AIR" ? Plane : Ship;

  return (
    <li className={open ? "bg-black/[0.015]" : ""}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-black/[0.02]"
      >
        {lead.kind === "inquiry" ? (
          thumb ? (
            <span className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-xl ${wt.thumb}`}>
              <Image src={thumb as string} alt="" fill sizes="48px" className="object-cover" />
            </span>
          ) : (
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[9px] font-semibold ${wt.thumb} ${wt.soft}`}>
              No image
            </span>
          )
        ) : freight ? (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-dark">
            <FreightIcon className="h-5 w-5" />
          </span>
        ) : (
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${wt.thumb} ${wt.soft}`}>
            <MessageSquare className="h-5 w-5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-[13.5px] font-semibold leading-snug">
            {lead.kind === "inquiry" ? lead.title : freight ? `Freight request ${freight.referenceNo}` : "Contact message"}
          </span>
          <span className={`mt-0.5 block text-[12px] ${wt.soft}`} title={formatDateTime(lead.createdAt)}>
            {lead.kind === "contact" && lead.message ? `${lead.message.slice(0, 60)}${lead.message.length > 60 ? "…" : ""} · ` : ""}
            {freight ? `${modeLabel(freight.mode)} · ${methodLabel(freight.method)} · ${freight.portOfLoading} → ${freight.portOfDischarge} · ` : ""}
            {timeAgo(lead.createdAt)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {lead.quantity !== null && (
            <span className="hidden rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand-dark sm:inline">
              Qty {lead.quantity}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""} ${wt.soft}`} />
        </span>
      </button>

      {open && (
        <div className={`border-t px-3 pb-4 pt-3 ${wt.border}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {lead.kind === "inquiry" && (
              <div className="shrink-0">
                {main ? (
                  <button
                    type="button"
                    onClick={() => onZoom(getCdnUrl(main, 1600) as string)}
                    title="Click to enlarge"
                    className={`group relative block h-44 w-full overflow-hidden rounded-2xl sm:h-40 sm:w-40 ${wt.thumb}`}
                  >
                    <Image
                      src={getCdnUrl(main, 384) as string}
                      alt={lead.title}
                      fill
                      sizes="(min-width: 640px) 160px, 100vw"
                      className="object-contain p-2 transition-transform duration-300 group-hover:scale-105"
                    />
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <ZoomIn className="h-3 w-3" /> Enlarge
                    </span>
                  </button>
                ) : (
                  <div className={`flex h-44 w-full items-center justify-center rounded-2xl text-[12px] sm:h-40 sm:w-40 ${wt.thumb} ${wt.soft}`}>
                    No photograph on file
                  </div>
                )}
                {images.length > 1 && (
                  <div className="mt-2 flex max-w-full gap-1.5 overflow-x-auto sm:w-40 sm:flex-wrap">
                    {images.slice(0, 8).map((src, i) => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => setShown(i)}
                        aria-label={`Photograph ${i + 1}`}
                        aria-pressed={i === shown}
                        className={`relative h-9 w-9 shrink-0 overflow-hidden rounded-lg ${wt.thumb} ring-2 transition ${
                          i === shown ? "ring-brand" : "ring-transparent hover:ring-black/10"
                        }`}
                      >
                        <Image src={getCdnUrl(src, 96) as string} alt="" fill sizes="36px" className="object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold leading-snug">
                {lead.kind === "inquiry"
                  ? lead.title
                  : freight
                    ? `${freight.portOfLoading} → ${freight.portOfDischarge}`
                    : `Message from ${lead.customerName}`}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {lead.quantity !== null && (
                  <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand-dark">
                    Quantity: {lead.quantity}
                  </span>
                )}
                {lead.kind === "contact" && (
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${wt.chip}`}>Contact form</span>
                )}
                {freight && (
                  <>
                    {/* The number the customer was given, and will quote. */}
                    <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold tabular-nums text-brand-dark">
                      {freight.referenceNo}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${wt.chip}`}>
                      {modeLabel(freight.mode)} · {methodLabel(freight.method)}
                    </span>
                  </>
                )}
                {latest && (
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${leadStatusChip(latest.status)}`}>
                    {leadStatusLabel(latest.status)}
                    {showsTimeToStaff(latest.status) && ` · ${timeAgo(latest.createdAt)}`}
                  </span>
                )}
              </div>
              {/* Only what the heading above does not already say. */}
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Fact icon={Inbox} label="Received" value={formatDateTime(lead.createdAt)} />
                {freight && (
                  <>
                    <Fact icon={Package} label="Goods" value={freight.commodity} />
                    <Fact icon={Layers} label="Cargo" value={commodityTypeLabel(freight.commodityType)} />
                    <Fact icon={FreightIcon} label="Method" value={`${methodLabel(freight.method)} · ${methodName(freight.method)}`} />
                    <Fact icon={FileText} label="Terms" value={`${termsLabel(freight.terms)}${freight.terms === "OTHER" ? "" : ` · ${termsName(freight.terms)}`}`} />
                    <Fact icon={Boxes} label="Volume" value={`${figure(freight.cbm)} m³`} />
                    <Fact icon={Scale} label="Weight" value={`${figure(freight.weightKg)} kg`} />
                    <Fact icon={Package} label="Cartons" value={freight.cartonBoxes ? freight.cartonBoxes.toLocaleString("en-IN") : "Not given"} />
                    <Fact icon={MapPin} label="Country" value={lead.country} />
                  </>
                )}
              </dl>
              {lead.message ? (
                <div className={`mt-3 rounded-xl p-3 ${wt.thumb}`}>
                  <p className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${wt.soft}`}>
                    {lead.kind === "inquiry" ? "What they wrote with it" : freight ? "Notes from the customer" : "Message"}
                  </p>
                  <p className="whitespace-pre-line text-sm font-medium leading-relaxed">{lead.message}</p>
                </div>
              ) : (
                <p className={`mt-3 text-[12.5px] ${wt.soft}`}>
                  {freight ? "No notes were added to this one." : "No message was sent with this one."}
                </p>
              )}
              {lead.productId && (
                <a
                  href={`/products/${lead.productId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-dark hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> View the product page
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function OutcomeBadge({ status }: { status: string | null }) {
  return status ? (
    <span className={`hidden rounded-full px-3 py-1 text-xs font-semibold sm:inline ${leadStatusChip(status)}`}>
      {leadStatusLabel(status)}
    </span>
  ) : (
    <span className={`hidden rounded-full px-3 py-1 text-xs font-semibold sm:inline ${NOT_STARTED_META.chip}`}>
      {NOT_STARTED_META.label}
    </span>
  );
}

/** A labelled fact — the console's Row, with the value tappable where it can be. */
function Fact({ icon: Icon, label, value, href }: { icon: LucideIcon; label: string; value: string; href?: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className={`mt-[3px] h-3.5 w-3.5 shrink-0 ${wt.soft}`} />
      <span className={`mt-px w-[74px] shrink-0 text-xs uppercase tracking-wide ${wt.soft}`}>{label}</span>
      {href ? (
        <a href={href} className="min-w-0 break-words font-semibold text-brand-dark hover:underline">{value}</a>
      ) : (
        <span className="min-w-0 break-words font-semibold">{value}</span>
      )}
    </div>
  );
}

export default CustomerDetail;
