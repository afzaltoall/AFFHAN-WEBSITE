"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Building2, Calendar, ChevronDown, Loader2, Mail, MapPin, MessageSquare, Package, Phone, Users,
} from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { timeAgo } from "@/lib/relative-time";
import {
  LEAD_NOTE_MAX, LEAD_STATUSES, LEAD_STATUS_META, leadStatusChip, leadStatusLabel, type LeadStatus,
} from "@/lib/leadStatus";

export interface LeadUpdate {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
  /** Who recorded it. Only shown when it was not the person reading. */
  byName: string;
  byMe: boolean;
}

export interface LeadCardData {
  kind: "inquiry" | "contact";
  id: string;
  createdAt: string;
  /** Product for a quote request; the sender's own name for a message. */
  title: string;
  image: string | null;
  customerName: string;
  companyName: string | null;
  country: string;
  phone: string;
  email: string | null;
  quantity: number | null;
  message: string | null;
  updates: LeadUpdate[];
}

/**
 * One assigned lead, with everything the office can see about it and the place
 * to say what happened to it.
 *
 * The detail matters: this is the whole of what a salesperson gets before they
 * pick up the phone, so it carries the same fields the console's own row does —
 * the product's photograph included, through the same CDN helper, because a
 * card with a grey box where the product should be is a card you have to go and
 * check somewhere else.
 *
 * Recording an outcome appends; it never edits the last one. The history below
 * the card is the trail, newest first.
 */
export function EmployeeLeadCard({ lead }: { lead: LeadCardData }) {
  const router = useRouter();
  const [updates, setUpdates] = useState<LeadUpdate[]>(lead.updates);
  const [choice, setChoice] = useState<LeadStatus | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const latest = updates[0] ?? null;

  const submit = async () => {
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
        setError(data.error || "Could not record that.");
        setSaving(false);
        return;
      }
      setUpdates((cur) => [{ ...data.update, byName: "you", byMe: true }, ...cur]);
      setChoice(null);
      setNote("");
      setHistoryOpen(true);
      // The admin's lists read the same rows; keep the server's copy of this
      // page in step for the next navigation.
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const thumb = getCdnUrl(lead.image, 128);

  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.04]">
      <div className="flex gap-3">
        {lead.kind === "inquiry" ? (
          thumb ? (
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f5f5f7]">
              <Image src={thumb} alt={lead.title} fill sizes="64px" className="object-cover" />
            </div>
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#f5f5f7] text-[10px] font-semibold text-[#86868b]">
              No img
            </div>
          )
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#f5f5f7] text-[#86868b]">
            <MessageSquare className="h-6 w-6" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-[15px] font-semibold leading-snug text-[#1d1d1f]">{lead.title}</p>
            <span className="flex shrink-0 items-center gap-2">
              {latest && (
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${leadStatusChip(latest.status)}`}>
                  {leadStatusLabel(latest.status)}
                </span>
              )}
              <span className="text-xs text-[#86868b]" title={new Date(lead.createdAt).toLocaleString("en-GB")}>
                {timeAgo(lead.createdAt)}
              </span>
            </span>
          </div>

          {/* The same fields, in the same order, as the console's row. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-[#48484a]">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Users className="h-3 w-3 shrink-0 text-[#86868b]" />
              <span className="truncate font-semibold">{lead.customerName}</span>
            </span>
            {lead.companyName && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Building2 className="h-3 w-3 shrink-0 text-[#86868b]" />
                <span className="truncate">{lead.companyName}</span>
              </span>
            )}
            {lead.country && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <MapPin className="h-3 w-3 shrink-0 text-[#86868b]" />
                <span className="truncate">{lead.country}</span>
              </span>
            )}
            {lead.quantity !== null && (
              <span className="inline-flex items-center gap-1.5">
                <Package className="h-3 w-3 shrink-0 text-[#86868b]" />
                <span className="font-medium tabular-nums">Qty {lead.quantity}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3 w-3 shrink-0 text-[#86868b]" />
              <span>{new Date(lead.createdAt).toLocaleDateString("en-GB")}</span>
            </span>
          </div>

          {/* Tappable, because this page is read on a phone between calls. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px]">
            {lead.phone && (
              <a href={`tel:${lead.phone.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-1.5 font-medium text-brand-dark hover:underline">
                <Phone className="h-3 w-3 shrink-0" />
                <span className="tabular-nums">{lead.phone}</span>
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="inline-flex min-w-0 items-center gap-1.5 font-medium text-brand-dark hover:underline">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{lead.email}</span>
              </a>
            )}
          </div>

          {lead.message && (
            <p className="mt-2 whitespace-pre-line rounded-xl bg-[#f5f5f7] px-3 py-2 text-[13px] leading-relaxed text-[#48484a]">
              {lead.message}
            </p>
          )}
        </div>
      </div>

      {/* ---- what happened to it ---- */}
      <div className="mt-3 border-t border-black/[0.06] pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {LEAD_STATUSES.map((s) => {
            const on = choice === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setChoice(on ? null : s)}
                title={LEAD_STATUS_META[s].hint}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 transition-colors ${
                  on
                    ? "bg-[#1d1d1f] text-white ring-transparent"
                    : "bg-white text-[#48484a] ring-black/[0.06] hover:bg-black/[0.02]"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-white/70" : LEAD_STATUS_META[s].dot}`} />
                {LEAD_STATUS_META[s].label}
              </button>
            );
          })}

          {updates.length > 0 && (
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#86868b] hover:text-[#1d1d1f]"
            >
              {updates.length} {updates.length === 1 ? "update" : "updates"}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>

        {choice && (
          <div className="mt-2.5">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, LEAD_NOTE_MAX))}
              rows={2}
              placeholder={`${LEAD_STATUS_META[choice].hint} — add a note if it helps (optional)`}
              className="w-full rounded-xl border border-black/[0.06] px-3 py-2 text-[13px] outline-none transition-shadow focus:ring-2 focus:ring-brand/30"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-dark px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Record {LEAD_STATUS_META[choice].label.toLowerCase()}
              </button>
              <button
                type="button"
                onClick={() => { setChoice(null); setNote(""); setError(null); }}
                className="rounded-xl px-3 py-2 text-[13px] font-semibold text-[#86868b] hover:text-[#1d1d1f]"
              >
                Cancel
              </button>
              <span className="text-[11px] text-[#86868b]">
                Recorded as a new entry — nothing already written is changed.
              </span>
            </div>
          </div>
        )}

        {error && <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-[12.5px] font-medium text-red-700">{error}</p>}

        {historyOpen && updates.length > 0 && (
          <ol className="mt-3 space-y-2 border-l-2 border-black/[0.06] pl-3">
            {updates.map((u) => (
              <li key={u.id} className="text-[12.5px]">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${leadStatusChip(u.status)}`}>
                    {leadStatusLabel(u.status)}
                  </span>
                  <span className="text-[#86868b]" title={new Date(u.createdAt).toLocaleString("en-GB")}>
                    {timeAgo(u.createdAt)}
                    {!u.byMe && ` · ${u.byName}`}
                  </span>
                </span>
                {u.note && <p className="mt-0.5 whitespace-pre-line text-[#48484a]">{u.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </li>
  );
}

export default EmployeeLeadCard;
