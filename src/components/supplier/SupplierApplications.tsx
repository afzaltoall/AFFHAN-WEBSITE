"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, Loader2, MessageSquareText, Package, Search } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { OPEN_STATUSES, SUPPLIER_STATUS_LABEL, moqPhrase, type OfferStatus } from "@/lib/supplier-offer";

export interface MyOffer {
  id: string;
  productId: number | null;
  productName: string;
  productImage: string | null;
  categoryName: string | null;
  moq: number;
  moqUnit: string;
  details: string;
  photos: string[];
  contactName: string;
  companyName: string;
  mobile: string;
  wechatId: string;
  companyAddress: string;
  status: OfferStatus;
  reply: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

type Filter = "all" | "open" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "REJECTED", label: "Not selected" },
  { key: "WITHDRAWN", label: "Withdrawn" },
];

const STATUS_STYLE: Record<OfferStatus, string> = {
  NEW: "bg-sky-50 text-sky-800 ring-sky-200",
  REVIEWING: "bg-amber-50 text-amber-800 ring-amber-200",
  ACCEPTED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REJECTED: "bg-slate-100 text-slate-700 ring-slate-200",
  WITHDRAWN: "bg-slate-50 text-slate-500 ring-slate-200",
};

const isOpen = (s: OfferStatus) => (OPEN_STATUSES as readonly string[]).includes(s);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * An application's picture, or the box when it has none or it will not load (2026-10-26: a catalogue picture
 * whose host had dropped it showed the browser's broken-image mark). The list is drawn on the server, so a
 * picture can fail before the page comes alive, when nothing hears its error: it is looked at once it has.
 */
function Thumb({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth === 0) setBroken(true);
  }, []);
  if (!src || broken) {
    return (
      <span className="flex h-full items-center justify-center">
        <Package className="h-6 w-6 text-[#9aabb0]" aria-hidden="true" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={img} src={src} alt="" onError={() => setBroken(true)} className="h-full w-full object-cover" />;
}

/**
 * What the supplier has applied for (the owner, 2026-10-21), newest first: each product with its MOQ, where it
 * stands (sent, being reviewed, accepted, not selected, withdrawn) and the team's reply when there is one. An
 * open application can be withdrawn; the rest stay as they were decided. A link from the catalogue's "View
 * application" (#id) opens and lights the one it names.
 */
export function SupplierApplications({ offers: initial }: { offers: MyOffer[] }) {
  const router = useRouter();
  const [offers, setOffers] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setOffers(initial), [initial]);

  // #id from the catalogue: open that application, bring it into view, and light it for a moment.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || !initial.some((o) => o.id === id)) return;
    setOpenId(id);
    setLit(id);
    window.requestAnimationFrame(() => document.getElementById(`offer-${id}`)?.scrollIntoView({ block: "center" }));
    const t = window.setTimeout(() => setLit(null), 2400);
    return () => window.clearTimeout(t);
  }, [initial]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: offers.length, open: 0, ACCEPTED: 0, REJECTED: 0, WITHDRAWN: 0 };
    for (const o of offers) {
      if (isOpen(o.status)) c.open++;
      else if (o.status in c) c[o.status as Filter]++;
    }
    return c;
  }, [offers]);

  const needle = q.trim().toLowerCase();
  const list = offers.filter(
    (o) =>
      (filter === "all" || (filter === "open" ? isOpen(o.status) : o.status === filter)) &&
      (!needle || `${o.productName} ${o.categoryName ?? ""} ${o.details}`.toLowerCase().includes(needle)),
  );

  const withdraw = async (id: string) => {
    if (!window.confirm("Withdraw this application? The team will no longer review it.")) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/supplier/offers/${id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "WITHDRAWN" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "That did not save. Try again.");
      setOffers((all) => all.map((o) => (o.id === id ? { ...o, status: "WITHDRAWN" } : o)));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-[#0b2230]">My applications</h1>
          <p className="mt-0.5 text-[13.5px] text-[#5b6f76]">
            {offers.length
              ? `${offers.length} sent${counts.open ? `, ${counts.open} still open` : ""}.`
              : "What you apply for appears here, with the team's answer."}
          </p>
        </div>
        <Link href="/supplier/" className="rounded-full bg-brand-dark px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-deep">
          Find more products
        </Link>
      </div>

      {offers.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                filter === f.key ? "bg-[#0b2230] text-white" : "bg-white text-[#33494f] ring-1 ring-[#dbe4e7] hover:ring-brand/60"
              }`}
            >
              {f.label} <span className={filter === f.key ? "text-white/70" : "text-[#7b8d93]"}>{counts[f.key]}</span>
            </button>
          ))}
          <label className="relative ml-auto w-full sm:w-64">
            <span className="sr-only">Search your applications</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a9ba0]" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search your applications"
              className="h-9 w-full rounded-full bg-white pl-9 pr-4 text-[13px] ring-1 ring-[#dbe4e7] outline-none focus:ring-2 focus:ring-brand/50"
            />
          </label>
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700 ring-1 ring-red-100">{error}</p>}

      {offers.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-[22px] bg-white px-6 py-14 text-center ring-1 ring-[#e1e8ea]">
          <Package className="h-10 w-10 text-brand" aria-hidden="true" />
          <p className="mt-3 text-[16px] font-bold text-[#0b2230]">No applications yet</p>
          <p className="mt-1 max-w-sm text-[13.5px] text-[#5b6f76]">
            Find a product your company makes or stocks, and press <span className="font-semibold">I have this</span>.
          </p>
          <Link href="/supplier/" className="mt-5 rounded-full bg-brand-dark px-5 py-2.5 text-[13.5px] font-bold text-white hover:bg-brand-deep">
            Find products
          </Link>
        </div>
      ) : list.length === 0 ? (
        <p className="mt-8 text-center text-[13.5px] text-[#5b6f76]">No applications match.</p>
      ) : (
        <ul className="mt-4 grid items-start gap-3 xl:grid-cols-2">
          {list.map((o) => {
            const expanded = openId === o.id;
            const picture = getCdnUrl(o.productImage, 200) ?? o.photos[0] ?? null;
            return (
              <li
                key={o.id}
                id={`offer-${o.id}`}
                className={`overflow-hidden rounded-2xl bg-white ring-1 transition-[box-shadow,ring-color] duration-700 ${
                  lit === o.id ? "ring-2 ring-brand shadow-[0_0_0_6px_rgba(39,168,196,0.15)]" : "ring-[#e1e8ea]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(expanded ? null : o.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3.5 p-3.5 text-left sm:p-4"
                >
                  <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f2f6f7]">
                    <Thumb key={picture ?? "none"} src={picture} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[14px] font-semibold leading-snug text-[#10262e]">{o.productName}</span>
                    <span className="mt-1 block truncate text-[12.5px] text-[#5b6f76]">
                      MOQ {moqPhrase(o.moq, o.moqUnit)} · Sent {day(o.createdAt)}
                      {o.productId === null ? " · Your own product" : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${STATUS_STYLE[o.status]}`}>
                      {SUPPLIER_STATUS_LABEL[o.status]}
                    </span>
                    {o.reply && !expanded && (
                      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-dark">
                        <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" /> Reply
                      </span>
                    )}
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[#8a9ba0] transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>

                {expanded && (
                  <div className="space-y-4 border-t border-[#edf2f3] px-4 pb-4 pt-3.5 sm:px-5">
                    {o.reply && (
                      <div className="rounded-xl bg-[#eef7f9] px-4 py-3 ring-1 ring-[#d3eaf0]">
                        <p className="text-[12px] font-bold text-brand-dark">
                          Reply from AFFHAN{o.reviewedAt ? ` · ${day(o.reviewedAt)}` : ""}
                        </p>
                        <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-[#10262e]">{o.reply}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[12px] font-semibold text-[#7b8d93]">Product details</p>
                      <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-[#10262e]">{o.details}</p>
                    </div>
                    {o.photos.length > 0 && (
                      <div>
                        <p className="text-[12px] font-semibold text-[#7b8d93]">Your photos</p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {o.photos.map((p) => (
                            <a key={p} href={p} target="_blank" rel="noopener noreferrer" className="block h-20 w-20 overflow-hidden rounded-xl bg-[#f2f6f7] ring-1 ring-[#e1e8ea]">
                              <Thumb src={p} />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                      {[
                        ["Name", o.contactName],
                        ["Company", o.companyName],
                        ["Mobile", o.mobile],
                        ["WeChat ID", o.wechatId],
                      ].map(([k, v]) => (
                        <div key={k} className="min-w-0">
                          <dt className="text-[12px] text-[#7b8d93]">{k}</dt>
                          <dd className="truncate font-medium">{v}</dd>
                        </div>
                      ))}
                      <div className="sm:col-span-2">
                        <dt className="text-[12px] text-[#7b8d93]">Address</dt>
                        <dd className="whitespace-pre-line font-medium">{o.companyAddress}</dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap items-center gap-2">
                      {o.productId !== null && (
                        <a
                          href={`/products/${o.productId}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-brand-dark ring-1 ring-[#cfdcdf] hover:bg-[#f2f8f9]"
                        >
                          See the product <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      )}
                      {isOpen(o.status) && (
                        <button
                          type="button"
                          onClick={() => void withdraw(o.id)}
                          disabled={busyId === o.id}
                          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          {busyId === o.id && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                          Withdraw
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
