"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, PhoneCall, Plane, RefreshCw, Ship } from "lucide-react";
import { Card, EmptyState, Fade, SectionHeader } from "@/components/account/AccountShell";
import {
  commodityTypeLabel,
  methodLabel,
  methodName,
  shipmentSentence,
  termsLabel,
  termsName,
  type AccountShipment,
} from "@/lib/shipment-inquiry";

/**
 * Every freight quote this customer has sent from /shipping/, with the
 * reference each one was given.
 *
 * The reference leads each card because it is what the customer quotes on the
 * phone, and the promise sits right under it: the shipping desk calls or
 * writes back. There is no step tracker, unlike My Inquiries: the office
 * records no customer-facing stage for a freight request, and drawing stages
 * nobody moves would be worse than saying plainly what happens next.
 *
 * Below that, everything they sent, laid out the way the form asked for it,
 * so they can check it before the call rather than during it.
 *
 * Reads /api/account/shipments, which lists only the requests stored against
 * this account.
 */

const figure = (v: string | number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });

export default function ShipmentsPage() {
  const [rows, setRows] = useState<AccountShipment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** The card a link pointed at (/account/shipments/#SHP-26-00001), briefly. */
  const [pointedAt, setPointedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/account/shipments/", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Could not load your shipments.");
        setRows([]);
        return;
      }
      const json = await res.json();
      setError(null);
      setRows(Array.isArray(json?.shipments) ? json.shipments : []);
    } catch {
      setError("Could not reach the server.");
      setRows([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The confirmation on /shipping/ links here with the reference as the hash.
  // The browser looks for that id before the list has loaded, finds nothing,
  // and gives up, so the jump is made once the cards exist.
  const jumped = useRef(false);
  useEffect(() => {
    if (!rows || jumped.current) return;
    jumped.current = true;
    const ref = decodeURIComponent(window.location.hash.slice(1));
    if (!ref || !rows.some((r) => r.referenceNo === ref)) return;
    document.getElementById(ref)?.scrollIntoView({ block: "start" });
    setPointedAt(ref);
    // No cleanup: a Refresh inside these seconds re-runs this effect, and
    // clearing the timer then would leave the ring on for good.
    setTimeout(() => setPointedAt(null), 2600);
  }, [rows]);

  return (
    <Fade>
      <SectionHeader
        title="My Shipments"
        subtitle="Freight quotes you've asked for, each with its shipment ID."
        action={
          rows && rows.length > 0 ? (
            <button
              onClick={() => void load()}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-[13px] font-medium text-slate-600 shadow-sm ring-1 ring-black/[0.04] transition-colors hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          ) : undefined
        }
      />

      {rows === null ? (
        <Card>
          <div className="flex justify-center py-16">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        </Card>
      ) : error ? (
        <Card>
          <EmptyState
            Icon={Ship}
            title="Couldn't load your shipments"
            body={error}
            action={
              <button
                onClick={() => void load()}
                className="rounded-xl bg-brand-dark px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep cursor-pointer"
              >
                Try again
              </button>
            }
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            Icon={Ship}
            title="No shipments yet"
            body="Ask for a freight quote on the shipping page. Its shipment ID and everything you send will be kept here, and our team will contact you with a rate and a routing."
            action={
              <Link
                href="/shipping/#shipping-quote"
                className="inline-block rounded-xl bg-brand-dark px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"
              >
                Request a freight quote
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((s) => (
            <ShipmentCard key={s.referenceNo} s={s} pointedAt={pointedAt === s.referenceNo} />
          ))}
        </div>
      )}
    </Fade>
  );
}

function ShipmentCard({ s, pointedAt }: { s: AccountShipment; pointedAt: boolean }) {
  const ModeIcon = s.mode === "AIR" ? Plane : Ship;
  const titleId = `${s.referenceNo}-title`;
  const sent = new Date(s.createdAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <Card className={`transition-shadow duration-500 ${pointedAt ? "ring-2 ring-brand/40" : ""}`}>
      {/* scroll-mt clears the fixed navbar when a link jumps to this card. */}
      <article id={s.referenceNo} aria-labelledby={titleId} className="scroll-mt-24">
        <div className="flex gap-4 p-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-dark">
            <ModeIcon size={21} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Shipment ID
                <span className="mx-1.5 text-slate-300">·</span>
                <span className="normal-case tracking-normal">Sent {sent}</span>
              </p>
              <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                Received
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 id={titleId} className="text-[22px] font-bold tracking-tight text-slate-900 tabular-nums sm:text-2xl">
                {s.referenceNo}
              </h2>
              <CopyReference value={s.referenceNo} />
            </div>

            <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">{shipmentSentence(s)}</p>
          </div>
        </div>

        {/* What happens next, directly under the ID it is about. */}
        <div className="mx-5 flex gap-3 rounded-xl border border-brand/15 bg-brand/[0.04] px-4 py-3.5">
          <PhoneCall size={16} className="mt-0.5 shrink-0 text-brand-dark" aria-hidden />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-slate-900">
              Our team will contact you as soon as possible.
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">
              On <span className="font-semibold text-slate-800">{s.phone}</span>
              {s.email && (
                <>
                  {" "}or <span className="break-words font-semibold text-slate-800">{s.email}</span>
                </>
              )}
              , with a rate and a routing. Quote {s.referenceNo} when you speak to us.
            </p>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <DetailGroup title="Shipment details">
            <Detail label="Commodity" value={s.commodity} />
            <Detail label="Type of cargo" value={commodityTypeLabel(s.commodityType)} />
            <Detail label="Mode" value={s.mode === "AIR" ? "Air freight" : "Sea freight"} />
            <Detail label="Method" value={`${methodLabel(s.method)} · ${methodName(s.method)}`} />
            <Detail label="Port of loading" value={s.portOfLoading} />
            <Detail label="Port of discharge" value={s.portOfDischarge} />
            <Detail
              label="Terms"
              value={s.terms === "OTHER" ? "Other" : `${termsLabel(s.terms)} · ${termsName(s.terms)}`}
            />
            <Detail label="Volume" value={`${figure(s.cbm)} m³`} />
            <Detail label="Weight" value={`${figure(s.weightKg)} kg`} />
            {s.cartonBoxes != null && <Detail label="Cartons" value={figure(s.cartonBoxes)} />}
          </DetailGroup>

          {s.notes && (
            <div className="border-l-2 border-slate-200 pl-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Your notes</p>
              <p className="mt-0.5 whitespace-pre-line break-words text-[13px] leading-relaxed text-slate-700">
                {s.notes}
              </p>
            </div>
          )}

          <DetailGroup title="Contact details">
            <Detail label="Company or name" value={s.customerName} />
            <Detail label="Mobile" value={s.phone} />
            {s.email && <Detail label="Email" value={s.email} />}
            <Detail label="Shipment country" value={s.country} />
          </DetailGroup>
        </div>
      </article>
    </Card>
  );
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-[12px] font-bold text-slate-800">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5 border-t border-slate-100 pt-3.5 sm:grid-cols-3 lg:grid-cols-4">
        {children}
      </dl>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] font-medium text-slate-800">{value}</dd>
    </div>
  );
}

/** The ID onto the clipboard; failing that, selected, so Ctrl+C still works. */
function CopyReference({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy(e: React.MouseEvent<HTMLButtonElement>) {
    // Read before the await: React clears currentTarget once the handler
    // returns, which is before a refused clipboard lands in the catch.
    const title = e.currentTarget.parentElement?.querySelector("h2");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      if (!title) return;
      const range = document.createRange();
      range.selectNodeContents(title);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => void copy(e)}
        aria-label={copied ? "Shipment ID copied" : `Copy shipment ID ${value}`}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ring-1 transition-colors cursor-pointer ${
          copied
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : "bg-white text-brand-dark ring-brand/25 hover:bg-brand/5"
        }`}
      >
        {copied ? <Check size={13} strokeWidth={3} aria-hidden /> : <Copy size={13} aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Shipment ID copied" : ""}
      </span>
    </>
  );
}
