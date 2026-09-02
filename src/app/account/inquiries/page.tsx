"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Loader2, MessageSquareText, Package, RefreshCw } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { Card, EmptyState, Fade, SectionHeader } from "@/components/account/AccountShell";

/**
 * Every quote this customer has asked for, and where each one stands.
 *
 * This is the section an Alibaba-shaped account page would call "Orders", and
 * it is not one. Affhan sells nothing on this site — no cart, no checkout, no
 * payment — so there is no order to track. What a customer actually starts
 * here is an inquiry, and what they want to know is whether anyone has picked
 * it up yet. Naming the section after the thing that exists beats naming it
 * after the thing a marketplace usually has and then showing an empty page.
 *
 * Reads /api/mobile/inquiries, which the app already uses: it authenticates
 * with either a Bearer token or the browser's session cookie, so the same rows
 * back both clients rather than two endpoints drifting apart.
 */

interface InquiryRow {
  id: string;
  productId: number | null;
  productName: string;
  productImage: string | null;
  requestedMOQ: number;
  status: "PENDING" | "CHECKED" | "IN_PROGRESS" | "CUSTOM";
  label: string;
  message: string;
  createdAt: string;
}

// The server sends the wording; these are only the colours it is shown in.
/**
 * How far along an inquiry is.
 *
 * Three stages, because there are only three the office actually records —
 * PENDING, CHECKED, IN_PROGRESS. No "delivered" step: nothing is sold here, so
 * an inquiry ends in a conversation, not a parcel. Inventing stages a customer
 * would then wait to see move would be worse than showing the three that are
 * real.
 *
 * CUSTOM is not on the line at all. It means the office wrote its own message,
 * which by definition does not fit the fixed path — the note is what is being
 * said, and drawing a track under it would imply a position it does not claim.
 */
const STAGES = [
  { key: "PENDING", label: "Received", blurb: "We have your request" },
  { key: "CHECKED", label: "Reviewed", blurb: "Our team has read it" },
  { key: "IN_PROGRESS", label: "Sourcing", blurb: "Finding you a factory" },
] as const;

function Tracker({ status }: { status: InquiryRow["status"] }) {
  if (status === "CUSTOM") return null;
  const current = STAGES.findIndex((s) => s.key === status);

  return (
    <ol className="mt-3.5 flex items-start gap-0 border-t border-slate-100 pt-3.5">
      {STAGES.map((stage, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={stage.key} className="flex flex-1 items-start gap-2">
            <span className="flex flex-col items-center">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  done
                    ? "bg-emerald-500 text-white"
                    : active
                      ? "bg-brand text-white ring-4 ring-brand/15"
                      : "bg-slate-200 text-slate-400"
                }`}
              >
                {done ? <Check size={11} strokeWidth={3} /> : i + 1}
              </span>
            </span>

            <span className="min-w-0 flex-1">
              <span
                className={`block text-[11px] font-semibold leading-tight ${
                  done || active ? "text-slate-800" : "text-slate-400"
                }`}
              >
                {stage.label}
              </span>
              <span className="mt-0.5 block text-[10px] leading-tight text-slate-400">
                {stage.blurb}
              </span>
            </span>

            {/* The connector belongs between steps, not after the last one. */}
            {i < STAGES.length - 1 && (
              <span
                aria-hidden="true"
                className={`mt-2.5 hidden h-px flex-1 sm:block ${done ? "bg-emerald-300" : "bg-slate-200"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

const TONE: Record<InquiryRow["status"], string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  CHECKED: "bg-sky-50 text-sky-700 ring-sky-200",
  IN_PROGRESS: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CUSTOM: "bg-brand/10 text-brand-dark ring-brand/20",
};

export default function InquiriesPage() {
  const [rows, setRows] = useState<InquiryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/mobile/inquiries", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Could not load your inquiries.");
        setRows([]);
        return;
      }
      const json = await res.json();
      setError(null);
      setRows(Array.isArray(json?.inquiries) ? json.inquiries : []);
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

  return (
    <Fade>
      <SectionHeader
        title="My Inquiries"
        subtitle="Quote requests you've sent, and what our team has done with them."
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
            Icon={MessageSquareText}
            title="Couldn't load your inquiries"
            body={error}
            action={
              <button
                onClick={() => void load()}
                className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark cursor-pointer"
              >
                Try again
              </button>
            }
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            Icon={MessageSquareText}
            title="No inquiries yet"
            body="Find something close to what you need and press Inquire Now. Our team sources it, checks the factory, and comes back to you with a quote."
            action={
              <Link
                href="/products/"
                className="inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
              >
                Browse products
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id}>
              <div className="flex gap-4 p-4">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {row.productImage ? (
                    <Image
                      src={getCdnUrl(row.productImage) ?? row.productImage}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      <Package size={20} className="text-slate-300" />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    {/* The product may have been dropped by a nightly re-sync,
                        which is why the name is copied onto the inquiry. Only
                        link when there is still something to link to. */}
                    {row.productId ? (
                      <Link
                        href={`/products/${row.productId}/`}
                        className="line-clamp-2 text-sm font-semibold text-slate-900 hover:text-brand"
                      >
                        {row.productName}
                      </Link>
                    ) : (
                      <span className="line-clamp-2 text-sm font-semibold text-slate-900">
                        {row.productName}
                      </span>
                    )}

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${TONE[row.status] ?? TONE.PENDING}`}
                    >
                      {row.label}
                    </span>
                  </div>

                  <p className="mt-1.5 text-[12px] text-slate-500">
                    Quantity requested:{" "}
                    <span className="font-semibold text-slate-700">
                      {row.requestedMOQ.toLocaleString()}
                    </span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    {new Date(row.createdAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>

                  {row.message && (
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-600">
                      {row.message}
                    </p>
                  )}

                  <Tracker status={row.status} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Fade>
  );
}
