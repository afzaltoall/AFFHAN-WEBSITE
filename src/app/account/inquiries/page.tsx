"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Check, Loader2, MessageSquareText, Package, RefreshCw, X } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { timeAgo } from "@/lib/relative-time";
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
 * Reads /api/account/inquiries, which merges both tables the company stores
 * inquiries in — Inquiry for this website's "Inquire Now" modal, MobileInquiry
 * for the app — and flattens them to one row shape. The page used to read
 * /api/mobile/inquiries directly, which meant a customer who had only ever
 * used the website saw an empty page telling them they had never asked for
 * anything.
 */

interface InquiryRow {
  id: string;
  source: "WEBSITE" | "APP";
  productId: number | null;
  productName: string;
  productImage: string | null;
  requestedMOQ: number;
  /** As the server tells it (lib/inquiry-status.ts): the old In Progress arrives as Checked. */
  status: "PENDING" | "CHECKED" | "CONFIRMED" | "CLOSED" | "CUSTOM";
  label: string;
  message: string;
  /** What the customer typed on the website form, if anything. */
  customerNote: string | null;
  createdAt: string;
  /** Null while nobody has moved it yet. */
  statusChangedAt: string | null;
}


// The server sends the wording; these are only the colours it is shown in.
/**
 * How far along an inquiry is, as the office works it (the owner, 2026-11-17):
 * Received when it is sent; Checked once the team has looked at it and will
 * call; then, after the call, Confirmed, or Closed with the reason, which takes
 * the last place on the line in grey. No "delivered" step: nothing is sold here,
 * so an inquiry ends in a conversation, not a parcel.
 *
 * CUSTOM is not on the line at all. It means the office wrote its own message,
 * which by definition does not fit the fixed path — the note is what is being
 * said, and drawing a track under it would imply a position it does not claim.
 */
const STAGES = [
  { key: "PENDING", label: "Received", blurb: "We have your request" },
  { key: "CHECKED", label: "Checked", blurb: "We will call you" },
  { key: "CONFIRMED", label: "Confirmed", blurb: "Going ahead" },
] as const;
/** The last place on the line when the request did not go ahead. */
const CLOSED_STAGE = { label: "Closed", blurb: "Not going ahead" };

function Tracker({
  status, tracking, justChecked, onTrack,
}: {
  status: InquiryRow["status"];
  /** A check for THIS card is in flight. */
  tracking: boolean;
  /** That check just finished — held briefly so the press is acknowledged. */
  justChecked: boolean;
  onTrack: () => void;
}) {
  // Closed takes the last place, in grey, where Confirmed would have been.
  const closed = status === "CLOSED";
  const current = closed ? STAGES.length - 1 : STAGES.findIndex((s) => s.key === status);

  // CUSTOM sits off the fixed path — the team wrote its own message, which by
  // definition does not claim a position on the line. The button still belongs
  // there: it is the same question ("has anything moved?"), and it was the one
  // status where the card offered no way to ask.
  const line =
    status === "CUSTOM" ? null : (
      <ol className="flex min-w-[19rem] flex-1 items-start gap-0">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const stage = closed && active ? CLOSED_STAGE : s;
          return (
            <li key={s.key} className="flex flex-1 items-start gap-2">
              <span className="flex flex-col items-center">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    done
                      ? "bg-emerald-500 text-white"
                      : active
                        ? closed
                          ? "bg-slate-400 text-white"
                          : "bg-brand-dark text-white ring-4 ring-brand/15"
                        : "bg-slate-200 text-slate-400"
                  }`}
                >
                  {done ? <Check size={11} strokeWidth={3} /> : closed && active ? <X size={11} strokeWidth={3} /> : i + 1}
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

  return (
    // The dead space to the right of the last step is where this button goes.
    // Per card, not one for the page: "has MY thing moved" is the question
    // being asked, and the answer arrives on the card being looked at.
    // Wraps rather than squeezes. Sharing one row with the button left the
    // three steps too narrow and their captions broke over two lines; below a
    // comfortable width the button drops to its own line instead.
    <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-slate-100 pt-3.5">
      {line}
      <button
        type="button"
        onClick={onTrack}
        disabled={tracking}
        className={`ml-auto flex shrink-0 items-center gap-1.5 self-center rounded-full px-3.5 py-2 text-[12px] font-semibold ring-1 transition-colors disabled:cursor-not-allowed ${
          justChecked
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : "bg-white text-brand-dark ring-brand/25 hover:bg-brand/5"
        } cursor-pointer`}
      >
        {tracking ? (
          <Loader2 size={13} className="animate-spin" />
        ) : justChecked ? (
          <Check size={13} strokeWidth={3} />
        ) : (
          <RefreshCw size={13} />
        )}
        {tracking ? "Checking…" : justChecked ? "Up to date" : "Track status"}
      </button>
    </div>
  );
}


const TONE: Record<InquiryRow["status"], string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  CHECKED: "bg-sky-50 text-sky-700 ring-sky-200",
  CONFIRMED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CLOSED: "bg-slate-100 text-slate-600 ring-slate-200",
  CUSTOM: "bg-brand/10 text-brand-dark ring-brand/20",
};

export default function InquiriesPage() {
  const [rows, setRows] = useState<InquiryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** Which card's "Track status" is in flight, and which just finished. */
  const [trackingKey, setTrackingKey] = useState<string | null>(null);
  const [checkedKey, setCheckedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/account/inquiries/", {
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

  /**
   * "Track status" on one card.
   *
   * Goes back to the same endpoint the page loads from, so whatever the office
   * has changed is what comes back — the card re-renders with the new stage,
   * message and "Updated …" line. It reads the whole list rather than one row
   * because the merged feed is the only shape the server offers, and it is a
   * handful of rows; a per-inquiry endpoint would be a second thing to keep in
   * step for no gain.
   *
   * The spinner and the "Up to date" tick are scoped to the card that was
   * pressed. Separate from the header's Refresh, which reloads the whole list
   * and says so.
   */
  const track = useCallback(async (key: string) => {
    setTrackingKey(key);
    setCheckedKey(null);
    try {
      const res = await fetch("/api/account/inquiries/", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        const list: InquiryRow[] = Array.isArray(json?.inquiries) ? json.inquiries : [];
        const fresh = list.find((r) => `${r.source}-${r.id}` === key);
        // ONLY the card that was pressed. The endpoint answers for every
        // inquiry — it is the same merged feed the page loads from — but
        // applying all of it would quietly move the other cards too, and this
        // button asks one question about one inquiry. The rest are left
        // exactly as they were; the header's Refresh is what updates them all.
        if (fresh) {
          setRows((prev) =>
            prev ? prev.map((r) => (`${r.source}-${r.id}` === key ? fresh : r)) : prev
          );
        }
      }
    } catch {
      // A failed check leaves the card showing what it already showed, which
      // is truthful — nothing new was learned.
    } finally {
      setTrackingKey(null);
      // Held briefly, so pressing it never looks like it did nothing — which
      // is exactly what "nothing has changed yet" would otherwise look like.
      setCheckedKey(key);
      setTimeout(() => setCheckedKey((k) => (k === key ? null : k)), 2400);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live (the owner, 2026-11-17: "when we click Checked in admin, it has to change for the user"): read again,
  // quietly, when the page is looked at again and every 30 s while it is in view. The list stays as it is meanwhile,
  // and a read that fails (a dropped connection, a sign-in that ended) changes nothing.
  useEffect(() => {
    const quiet = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/account/inquiries/", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (Array.isArray(json?.inquiries)) {
          setRows(json.inquiries);
          setError(null);
        }
      } catch {
        // Nothing new learned; what is shown stays true.
      }
    };
    const onShow = () => {
      if (document.visibilityState === "visible") void quiet();
    };
    document.addEventListener("visibilitychange", onShow);
    const every = window.setInterval(() => void quiet(), 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.clearInterval(every);
    };
  }, []);

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
            Icon={MessageSquareText}
            title="No inquiries yet"
            body="Find something close to what you need and press Inquire Now. Our team sources it, checks the factory, and comes back to you with a quote."
            action={
              <Link
                href="/products/"
                className="inline-block rounded-xl bg-brand-dark px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"
              >
                Browse products
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            // Keyed by source too: the two tables mint their own ids and have
            // no shared uniqueness guarantee.
            <Card key={`${row.source}-${row.id}`}>
              <div className="flex gap-4 p-4">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {row.productImage ? (
                    <Image
                      src={getCdnUrl(row.productImage, 160) ?? row.productImage}
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
                        className="line-clamp-2 text-sm font-semibold text-slate-900 hover:text-brand-dark"
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
                    {/* The reassurance this page is for: proof that somebody
                        has touched it since. Absent until someone actually
                        has, rather than echoing the submission date back as
                        an "update" that never happened. */}
                    {row.statusChangedAt && (
                      <>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="font-medium text-slate-600">
                          Updated {timeAgo(row.statusChangedAt)}
                        </span>
                      </>
                    )}
                  </p>

                  {/* Said BY somebody, and now it says so.
                      Unattributed, this read as system boilerplate and got
                      skimmed — it is the answer the customer is waiting for,
                      written by our team, so it is signed like a message
                      rather than printed like a field. */}
                  {row.message && (
                    <div className="mt-2.5 rounded-xl border border-brand/15 bg-brand/[0.04] px-3.5 py-3">
                      <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-brand-dark">
                        <BadgeCheck size={13} className="shrink-0" />
                        Message from the AFFHAN team
                      </p>
                      <p className="text-[13.5px] font-medium leading-relaxed text-slate-800">
                        {row.message}
                      </p>
                    </div>
                  )}

                  {/* A request that did not go ahead still leaves the customer a way back. */}
                  {row.status === "CLOSED" && (
                    <p className="mt-2 text-[12.5px] text-slate-600">
                      {"You can send a new request any time. "}
                      <Link href="/contact/" className="font-semibold text-brand-dark hover:underline">
                        Request for Quotation
                      </Link>
                    </p>
                  )}

                  {/* The customer's own words. Labelled for the same reason
                      the message above is: two quoted blocks stacked on one
                      card, and nothing said which of them was whose. */}
                  {row.customerNote && (
                    <div className="mt-2 border-l-2 border-slate-200 pl-3">
                      <p className="text-[12px] font-medium text-slate-500">
                        What you asked for
                      </p>
                      <p className="mt-0.5 text-[12.5px] italic leading-relaxed text-slate-600">
                        &ldquo;{row.customerNote}&rdquo;
                      </p>
                    </div>
                  )}

                  <Tracker
                    status={row.status}
                    tracking={trackingKey === `${row.source}-${row.id}`}
                    justChecked={checkedKey === `${row.source}-${row.id}`}
                    onTrack={() => void track(`${row.source}-${row.id}`)}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Fade>
  );
}
