"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Building2, ExternalLink, Inbox, Loader2, Mail, MapPin, MessageCircle, MessageSquare, Phone, PhoneCall,
  Users, X, ZoomIn, type LucideIcon,
} from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { timeAgo } from "@/lib/relative-time";
import {
  LEAD_NOTE_MAX, LEAD_STATUSES, LEAD_STATUS_META, leadStatusChip, leadStatusLabel, NOT_STARTED_META,
  type LeadStatus,
} from "@/lib/leadStatus";
import type { LeadCardData, LeadUpdate } from "@/components/employee/lead-types";
import { wt } from "@/components/employee/workspace-ui";

const waLink = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * One lead, opened out: everything the office knows about it, and the place to
 * say what happened to it.
 *
 * Built on the console's own inquiry drawer, because the admin already reads
 * leads this way and the person they hand one to should see the same thing —
 * the product band across the top with its photograph large enough to
 * identify, the customer's facts two up beneath it, the message, and the ways
 * to reach them pinned to the bottom. Two additions the drawer does not need:
 * the rest of the product's photographs, since a salesperson on a call gets
 * asked "the black one or the brown one?", and a link to the product's page on
 * the site, which is what the customer was looking at when they asked.
 *
 * Recording an outcome appends; it never edits the last one. The trail below
 * it is the history, newest first, whoever wrote it.
 */
export function LeadDetail({
  lead,
  onClose,
  onRecorded,
}: {
  lead: LeadCardData;
  onClose: () => void;
  onRecorded: (update: LeadUpdate) => void;
}) {
  const [shown, setShown] = useState(0);
  const [zoom, setZoom] = useState<string | null>(null);
  const [choice, setChoice] = useState<LeadStatus | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const images = lead.images.length ? lead.images : lead.image ? [lead.image] : [];
  const main = images[Math.min(shown, images.length - 1)] ?? null;
  const latest = lead.updates[0] ?? null;

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

  const record = async () => {
    if (!choice) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/employee/leads/status/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: lead.kind, leadId: lead.id, status: choice, note }),
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
      onRecorded({ ...data.update, byName: "you", byMe: true });
      setChoice(null);
      setNote("");
      setSavedAt(Date.now());
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const tel = lead.phone ? `tel:${lead.phone.replace(/[^0-9+]/g, "")}` : null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-detail-title"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white text-[#1d1d1f] shadow-2xl ring-1 ring-black/[0.06]"
      >
        <div className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${wt.border}`}>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{lead.kind === "inquiry" ? "Quote request" : "Contact message"}</p>
            <p className={`text-[12px] ${wt.soft}`}>Received {timeAgo(lead.createdAt)}</p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${wt.thumb} ${wt.soft} hover:text-brand-dark`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* min-h-0 so the body scrolls inside the panel instead of the panel
            being cropped — the console's drawer learned this on phones. */}
        <div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain p-5">
          {/* ---- what they asked about ---- */}
          {lead.kind === "inquiry" ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="shrink-0">
                {main ? (
                  <button
                    type="button"
                    onClick={() => setZoom(getCdnUrl(main, 1600) as string)}
                    title="Click to enlarge"
                    className={`group relative block h-44 w-full overflow-hidden rounded-2xl sm:h-44 sm:w-44 ${wt.thumb}`}
                  >
                    <Image
                      src={getCdnUrl(main, 384) as string}
                      alt={lead.title}
                      fill
                      sizes="(min-width: 640px) 176px, 100vw"
                      className="object-contain p-2 transition-transform duration-300 group-hover:scale-105"
                    />
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <ZoomIn className="h-3 w-3" /> Enlarge
                    </span>
                  </button>
                ) : (
                  <div className={`flex h-44 w-full items-center justify-center rounded-2xl text-[12px] sm:w-44 ${wt.thumb} ${wt.soft}`}>
                    No photograph on file
                  </div>
                )}
                {images.length > 1 && (
                  <div className="mt-2 flex max-w-full gap-1.5 overflow-x-auto sm:w-44 sm:flex-wrap">
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

              <div className="min-w-0 flex-1">
                <h2 id="lead-detail-title" className="text-lg font-semibold leading-snug">{lead.title}</h2>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {lead.quantity !== null && (
                    <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand-dark">
                      Quantity: {lead.quantity}
                    </span>
                  )}
                  <OutcomeBadge status={latest?.status ?? null} />
                </div>
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
          ) : (
            <div className="flex items-start gap-4">
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${wt.thumb} ${wt.soft}`}>
                <MessageSquare className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="lead-detail-title" className="text-lg font-semibold leading-snug">{lead.title}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${wt.chip}`}>Contact form</span>
                  <OutcomeBadge status={latest?.status ?? null} />
                </div>
              </div>
            </div>
          )}

          {/* ---- who asked ---- */}
          <dl className="mt-5 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
            <Fact icon={Users} label="Customer" value={lead.customerName} />
            {lead.companyName && <Fact icon={Building2} label="Company" value={lead.companyName} />}
            {lead.country && <Fact icon={MapPin} label="Country" value={lead.country} />}
            {lead.phone && <Fact icon={Phone} label="Phone" value={lead.phone} href={tel ?? undefined} />}
            {lead.email && <Fact icon={Mail} label="Email" value={lead.email} href={`mailto:${lead.email}`} />}
            <Fact icon={Inbox} label="Received" value={fmtDateTime(lead.createdAt)} />
          </dl>

          {lead.message && (
            <div className={`mt-4 rounded-xl p-3 ${wt.thumb}`}>
              <p className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${wt.soft}`}>Message</p>
              <p className="whitespace-pre-line text-sm font-medium leading-relaxed">{lead.message}</p>
            </div>
          )}

          {/* ---- what happened ---- */}
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
                    Added as a new entry — nothing already written changes.
                  </span>
                </div>
              </div>
            )}
            {savedAt && !choice && (
              <p className="mt-2 text-[12.5px] font-medium text-emerald-700">Recorded. The office sees it now.</p>
            )}
            {error && <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-[12.5px] font-medium text-red-700">{error}</p>}

            <p className={`mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide ${wt.soft}`}>
              History {lead.updates.length > 0 && `· ${lead.updates.length}`}
            </p>
            {lead.updates.length === 0 ? (
              <p className={`text-[13px] ${wt.soft}`}>Nothing recorded yet. Whatever you record appears here, newest first.</p>
            ) : (
              <ol className="space-y-2.5 border-l-2 border-black/[0.06] pl-3">
                {lead.updates.map((u) => (
                  <li key={u.id} className="text-[12.5px]">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${leadStatusChip(u.status)}`}>
                        {leadStatusLabel(u.status)}
                      </span>
                      <span className={wt.soft} title={fmtDateTime(u.createdAt)}>
                        {timeAgo(u.createdAt)} · {u.byMe ? "you" : u.byName}
                      </span>
                    </span>
                    {u.note && <p className="mt-0.5 whitespace-pre-line text-[#48484a]">{u.note}</p>}
                  </li>
                ))}
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
          {lead.phone && (
            <a href={waLink(lead.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-[#1d1d1f] ring-1 ring-black/[0.08] transition-colors hover:bg-black/[0.02]">
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
          <img src={zoom} alt={lead.title} className="max-h-[90dvh] max-w-[92vw] rounded-2xl bg-white object-contain" />
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

function OutcomeBadge({ status }: { status: string | null }) {
  return status ? (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${leadStatusChip(status)}`}>{leadStatusLabel(status)}</span>
  ) : (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${NOT_STARTED_META.chip}`}>{NOT_STARTED_META.label}</span>
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

export default LeadDetail;
